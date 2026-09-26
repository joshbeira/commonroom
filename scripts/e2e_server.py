"""Run browser tests against a fresh database, never a developer's household."""

import os
import sys
import tempfile
from pathlib import Path

from waitress import serve

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from server import create_app  # noqa: E402

os.environ["APP_ENV"] = "development"

with tempfile.TemporaryDirectory(prefix="commonroom-e2e-") as directory:
    app = create_app({"DATABASE": str(Path(directory) / "test.db"), "DEMO_ENABLED": True})
    serve(app, host="127.0.0.1", port=8001, threads=24)
