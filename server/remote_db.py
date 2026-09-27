"""DB-API compatibility for authoritative remote libSQL storage.

Writes commit at the remote primary; no local replica or ephemeral fallback is used.
"""

import sqlite3

import libsql


def _call(function, *args):
    try:
        return function(*args)
    except (ValueError, libsql.Error) as error:
        message = str(error)
        if "constraint failed" in message.lower():
            raise sqlite3.IntegrityError(message) from error
        # Avoid returning connection details or database tokens to callers/logs.
        raise sqlite3.OperationalError("Remote database operation failed") from error


class Row:
    def __init__(self, names, values):
        self.names = names
        self.values = values

    def keys(self):
        return self.names

    def __getitem__(self, key):
        return self.values[self.names.index(key)] if isinstance(key, str) else self.values[key]

    def __iter__(self):
        return iter(self.values)


class Cursor:
    def __init__(self, cursor):
        self.cursor = cursor
        self.lastrowid = cursor.lastrowid
        self.rowcount = cursor.rowcount
        self.names = tuple(column[0] for column in (cursor.description or ()))

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
        return _call(self.connection.executescript, sql)

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
