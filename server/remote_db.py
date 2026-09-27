"""DB-API compatibility for authoritative remote libSQL storage.

Writes commit at the remote primary; no local replica or ephemeral fallback is used.
"""

import logging
import os
import re
import sqlite3

import libsql


def _call(function, *args):
    try:
        return function(*args)
    except (ValueError, libsql.Error) as error:
        message = str(error)
        if "constraint failed" in message.lower():
            raise sqlite3.IntegrityError(message) from error
        # Retain diagnostic context without logging secrets, endpoints, or parameters.
        for key in ("TURSO_AUTH_TOKEN", "TURSO_DATABASE_URL"):
            if value := os.getenv(key):
                message = message.replace(value, "[redacted]")
        message = re.sub(r"eyJ[A-Za-z0-9_.-]+", "[redacted]", message)
        message = re.sub(r"(?:https?|libsql)://\S+", "[endpoint]", message)
        logging.getLogger(__name__).error(
            "Remote database %s failed: %s", function.__name__, message[:400]
        )
        raise sqlite3.OperationalError("Remote database operation failed") from error


class Row:
    def __init__(self, names, values):
        self.names = names
        self.values = values

    def keys(self):
        return self.names

    def __getitem__(self, key):
        return self.values[self.names.index(key.lower())] if isinstance(key, str) else self.values[key]

    def __iter__(self):
        return iter(self.values)


class Cursor:
    def __init__(self, cursor):
        self.cursor = cursor
        self.lastrowid = cursor.lastrowid
        self.rowcount = cursor.rowcount
        # Turso's SQL parser normalizes keyword column names (e.g. ACTION)
        # to uppercase. The application's schema and JSON keys are lowercase.
        self.names = tuple(column[0].lower() for column in (cursor.description or ()))

    def fetchone(self):
        values = _call(self.cursor.fetchone)
        return None if values is None else Row(self.names, values)

    def fetchall(self):
        return [Row(self.names, values) for values in _call(self.cursor.fetchall)]

    def __iter__(self):
        while (row := self.fetchone()) is not None:
            yield row


class Connection:
    def __init__(self, connection):
        self.connection = connection

    def execute(self, sql, params=()):
        return Cursor(_call(self.connection.execute, sql, params))

    def executemany(self, sql, params):
        return Cursor(_call(self.connection.executemany, sql, params))

    def executescript(self, sql):
        # libsql 0.1.11's Connection.executescript silently discards errors;
        # its cursor implementation propagates them so startup fails safely.
        return _call(self.connection.cursor().executescript, sql)

    def commit(self):
        return _call(self.connection.commit)

    def rollback(self):
        return _call(self.connection.rollback)

    def close(self):
        return self.connection.close()


def connect(url, token):
    if not token:
        raise RuntimeError("TURSO_AUTH_TOKEN is required for remote storage.")
    connection = Connection(libsql.connect(url, auth_token=token, isolation_level=None, timeout=5))
    connection.execute("PRAGMA foreign_keys = ON")
    return connection
