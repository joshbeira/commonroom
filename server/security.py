"""Session revocation, CSRF, throttling, and strict input validation."""

import hashlib
import hmac
import secrets
import time
from functools import wraps

from flask import abort, g, request, session

from .db import get_db, transaction


def digest(value):
    return hashlib.sha256(value.encode()).hexdigest()


def login(user_id):
    db = get_db()
    if session.get("sid"):
        db.execute("DELETE FROM sessions WHERE token_hash=?", (digest(session["sid"]),))
    session.clear()
    session["sid"] = secrets.token_urlsafe(32)
    session["csrf"] = secrets.token_urlsafe(32)
    db.execute("DELETE FROM sessions WHERE expires<?", (int(time.time()),))
    db.execute(
        "INSERT INTO sessions VALUES (?,?,?)",
        (digest(session["sid"]), user_id, int(time.time()) + 43200),
    )


def authenticate():
    g.user = None
    if token := session.get("sid"):
        g.user = (
            get_db()
            .execute(
                "SELECT u.* FROM sessions s JOIN users u ON u.id=s.user_id WHERE s.token_hash=? AND s.expires>?",
                (digest(token), int(time.time())),
            )
            .fetchone()
        )
    if request.path.startswith("/api/") and request.method not in ("GET", "HEAD", "OPTIONS"):
        supplied, expected = request.headers.get("X-CSRF-Token", ""), session.get("csrf", "")
        if not expected or not hmac.compare_digest(supplied, expected):
            abort(403, "Your session changed. Refresh the page and try again.")
        if request.headers.get("Sec-Fetch-Site") == "cross-site":
            abort(403, "Cross-site requests are not permitted.")


def require_user(fn):
    @wraps(fn)
    def wrapped(*args, **kwargs):
        if g.user is None:
            abort(401, "Sign in to continue.")
        return fn(*args, **kwargs)

    return wrapped


def household():
    if g.user is None:
        abort(401, "Sign in to continue.")
    result = (
        get_db()
        .execute(
            "SELECT h.* FROM households h JOIN members m ON m.household_id=h.id WHERE m.user_id=?",
            (g.user["id"],),
        )
        .fetchone()
    )
    if result is None:
        abort(409, "Create or join a household first.")
    return result


def limited(bucket, limit=10, seconds=300):
    def decorator(fn):
        @wraps(fn)
        def wrapped(*args, **kwargs):
            key = digest(f"{bucket}:{request.remote_addr}")
            timestamp = int(time.time())
            with transaction() as db:
                db.execute("DELETE FROM rate_limits WHERE expires<=?", (timestamp,))
                row = db.execute(
                    "SELECT count,expires FROM rate_limits WHERE key=?", (key,)
                ).fetchone()
                if row and row["count"] >= limit:
                    g.retry_after = row["expires"] - timestamp
                    abort(429, "Too many requests. Please wait before trying again.")
                db.execute(
                    "INSERT INTO rate_limits VALUES (?,1,?) ON CONFLICT(key) DO UPDATE SET count=count+1",
                    (key, timestamp + seconds),
                )
            return fn(*args, **kwargs)

        return wrapped

    return decorator


def body():
    data = request.get_json()
    if not isinstance(data, dict):
        abort(400, "Send a JSON object.")
    return data


def text_field(data, name, minimum=1, maximum=100):
    value = data.get(name, "")
    if isinstance(value, str) and name != "password":
        value = value.strip()
    if not isinstance(value, str) or not minimum <= len(value) <= maximum:
        abort(400, f"{name.replace('_', ' ').capitalize()} must be {minimum}–{maximum} characters.")
    return value
