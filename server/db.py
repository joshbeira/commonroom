"""Short transactions, parameterized SQL, and versioned migrations."""

import sqlite3
from contextlib import contextmanager
from pathlib import Path

from flask import current_app, g


def connect(path):
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
    Path(path).parent.mkdir(parents=True, exist_ok=True)
    db = connect(path)
    db.execute("PRAGMA journal_mode = WAL")
    version = db.execute("PRAGMA user_version").fetchone()[0]
    for migration in sorted(Path(__file__).with_name("migrations").glob("*.sql")):
        number = int(migration.stem.split("_")[0])
        if number > version:
            db.executescript(
                f"BEGIN IMMEDIATE;\n{migration.read_text()}\nPRAGMA user_version = {number};\nCOMMIT;"
            )
    db.close()


def close_db(_error=None):
    if db := g.pop("db", None):
        db.close()
