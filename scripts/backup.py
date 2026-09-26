"""Create and validate a live SQLite snapshot without copying incomplete WAL state."""

import argparse
import sqlite3
from pathlib import Path


def backup(source: Path, destination: Path):
    source, destination = source.resolve(), destination.resolve()
    if not source.is_file():
        raise ValueError("Source database does not exist.")
    if destination.exists():
        raise ValueError("Destination exists; choose a new backup filename.")
    destination.parent.mkdir(parents=True, exist_ok=True)
    # Exclusive creation avoids accidentally replacing a concurrent operator's snapshot.
    with destination.open("xb"):
        pass
    src = sqlite3.connect(source.as_uri() + "?mode=ro", uri=True)
    dst = sqlite3.connect(destination)
    try:
        src.backup(dst)
        if dst.execute("PRAGMA integrity_check").fetchone()[0] != "ok":
            raise RuntimeError("Backup integrity check failed; retain the source and investigate.")
    finally:
        dst.close()
        src.close()


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("source", type=Path)
    parser.add_argument("destination", type=Path)
    args = parser.parse_args()
    backup(args.source, args.destination)
    print(f"Verified SQLite backup created: {args.destination}")
