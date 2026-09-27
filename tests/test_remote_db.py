import sqlite3

import libsql
import pytest

from server.remote_db import Connection, connect


def test_driver_rows_constraints_transactions_and_reopen(tmp_path):
    path = str(tmp_path / "libsql.db")
    db = Connection(libsql.connect(path, isolation_level=None))
    db.executescript("CREATE TABLE items (id INTEGER PRIMARY KEY, name TEXT UNIQUE);")
    db.execute("BEGIN IMMEDIATE")
    inserted = db.execute("INSERT INTO items(name) VALUES (?)", ("kept",))
    assert inserted.lastrowid == 1
    db.commit()
    db.execute("BEGIN IMMEDIATE")
    db.execute("INSERT INTO items(name) VALUES (?)", ("rolled-back",))
    db.rollback()
    with pytest.raises(sqlite3.IntegrityError):
        db.execute("INSERT INTO items(name) VALUES (?)", ("kept",))
    row = db.execute("SELECT * FROM items").fetchone()
    assert row[0] == row["id"] == 1
    assert dict(row) == {"id": 1, "name": "kept"}
    assert [dict(row) for row in db.execute("SELECT * FROM items")] == [dict(row)]
    assert len(db.execute("SELECT * FROM items").fetchall()) == 1
    db.close()
    reopened = Connection(libsql.connect(path, isolation_level=None))
    assert reopened.execute("SELECT name FROM items").fetchone()[0] == "kept"
    reopened.close()


def test_remote_storage_requires_a_token():
    with pytest.raises(RuntimeError, match="TURSO_AUTH_TOKEN"):
        connect("libsql://missing.example.com", "")


def test_migration_script_errors_are_not_silently_ignored():
    db = Connection(libsql.connect(":memory:", isolation_level=None))
    with pytest.raises(sqlite3.OperationalError):
        db.executescript("INVALID SQL;")
    db.close()


def test_render_never_falls_back_to_temporary_storage(monkeypatch):
    from server import create_app

    monkeypatch.setenv("APP_ENV", "production")
    monkeypatch.setenv("RENDER", "true")
    monkeypatch.delenv("TURSO_DATABASE_URL", raising=False)
    with pytest.raises(RuntimeError, match="persistent TURSO_DATABASE_URL"):
        create_app()
