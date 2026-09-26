import sqlite3

import pytest

from scripts.backup import backup


def test_live_wal_backup_is_consistent_and_never_overwrites(tmp_path):
    source, snapshot = tmp_path / "source.db", tmp_path / "snapshot.db"
    db = sqlite3.connect(source)
    db.execute("PRAGMA journal_mode=WAL")
    db.execute("CREATE TABLE example (value INTEGER)")
    db.execute("INSERT INTO example VALUES (123)")
    db.commit()
    backup(source, snapshot)
    with sqlite3.connect(snapshot) as restored:
        assert restored.execute("SELECT value FROM example").fetchone()[0] == 123
    with pytest.raises(ValueError, match="exists"):
        backup(source, snapshot)
    db.close()
