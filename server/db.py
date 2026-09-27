"""Short transactions, parameterized SQL, and versioned migrations."""

import os
import sqlite3
from contextlib import contextmanager
from pathlib import Path

from flask import current_app, g


def connect(path):
    if path.startswith("libsql://"):
        from .remote_db import connect as remote_connect

        return remote_connect(path, os.environ.get("TURSO_AUTH_TOKEN", ""))
    connection = sqlite3.connect(path, timeout=5, isolation_level=None)
    connection.row_factory = sqlite3.Row
    connection.execute("PRAGMA foreign_keys = ON")
    connection.execute("PRAGMA busy_timeout = 5000")
    return connection


def get_db():
    if "db" not in g:
        g.db = connect(current_app.config["DATABASE"])
    return g.db


@contextmanager
def transaction():
    db = get_db()
    db.execute("BEGIN IMMEDIATE")
    try:
        yield db
        db.commit()
    except Exception:
        db.rollback()
        raise


def migrate(path):
    remote = path.startswith("libsql://")
    if not remote:
        Path(path).parent.mkdir(parents=True, exist_ok=True)
    db = connect(path)
    try:
        if remote:
            # Turso read/write tokens cannot set PRAGMA user_version. Keep the
            # schema version in an ordinary table, committed with each migration.
            db.execute(
                "CREATE TABLE IF NOT EXISTS commonroom_schema_migrations (version INTEGER PRIMARY KEY)"
            )
            version = db.execute(
                "SELECT COALESCE(MAX(version), 0) FROM commonroom_schema_migrations"
            ).fetchone()[0]
        else:
            db.execute("PRAGMA journal_mode = WAL")
            version = db.execute("PRAGMA user_version").fetchone()[0]
        for migration in sorted(Path(__file__).with_name("migrations").glob("*.sql")):
            number = int(migration.stem.split("_")[0])
            if number > version:
                record_version = (
                    f"INSERT INTO commonroom_schema_migrations VALUES ({number});"
                    if remote
                    else f"PRAGMA user_version = {number};"
                )
                db.executescript(
                    f"BEGIN IMMEDIATE;\n{migration.read_text()}\n{record_version}\nCOMMIT;"
                )
    except Exception:
        db.rollback()
        raise
    finally:
        db.close()


def close_db(_error=None):
    if db := g.pop("db", None):
        db.close()
