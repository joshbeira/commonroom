import time
from unittest.mock import MagicMock, patch

import pytest

from server import create_app
from server.db import get_db

from .conftest import post, register


def test_stream_limit_and_release(client):
    post(client, "/auth/demo")
    first = client.get("/api/events", buffered=False)
    second = client.get("/api/events", buffered=False)
    assert client.get("/api/events").status_code == 429
    first.close()
    third = client.get("/api/events", buffered=False)
    assert third.status_code == 200
    second.close()
    third.close()


def test_expired_stream_lease_reclaimed(app, client):
    register(client)
    post(client, "/household", {"name": "Test House"})
    uid = client.get("/api/session").json["user"]["id"]
    with app.app_context():
        get_db().executemany(
            "INSERT INTO stream_leases VALUES (?,?,?)", [(str(i), uid, 0) for i in range(18)]
        )
    stream = client.get("/api/events")
    assert stream.status_code == 200
    stream.close()


def test_password_whitespace_is_preserved(client):
    password = "  a long password  "
    assert (
        post(
            client,
            "/auth/register",
            {"name": "Alex", "email": "alex@example.test", "password": password},
        ).status_code
        == 201
    )
    post(client, "/auth/logout")
    assert (
        post(
            client, "/auth/login", {"email": "alex@example.test", "password": password.strip()}
        ).status_code
        == 401
    )
    assert (
        post(
            client, "/auth/login", {"email": "alex@example.test", "password": password}
        ).status_code
        == 200
    )


def test_recovery_delivery_and_generic_response(app, client, monkeypatch):
    register(client)
    monkeypatch.setenv("SMTP_HOST", "smtp.example.test")
    monkeypatch.setenv("SMTP_FROM", "support@example.test")
    smtp = MagicMock()
    with patch("server.api.smtplib.SMTP", return_value=smtp):
        known = post(client, "/auth/recover", {"email": "alex@example.test"})
        unknown = post(client, "/auth/recover", {"email": "nobody@example.test"})
    assert known.json == unknown.json
    smtp.__enter__.return_value.starttls.assert_called_once()
    smtp.__enter__.return_value.send_message.assert_called_once()
    with app.app_context():
        assert (
            get_db()
            .execute("SELECT COUNT(*) FROM reset_tokens WHERE expires>?", (int(time.time()),))
            .fetchone()[0]
            == 1
        )


def test_demo_disabled_returns_not_found(app, client):
    app.config["DEMO_ENABLED"] = False
    assert post(client, "/auth/demo").status_code == 404


def test_production_guard_and_cookie(tmp_path, monkeypatch):
    monkeypatch.setenv("APP_ENV", "production")
    config = {
        "TESTING": True,
        "DATABASE": str(tmp_path / "production.db"),
        "SECRET_KEY": "s" * 64,
        "AUDIT_KEY": "a" * 64,
        "DEMO_ENABLED": False,
    }
    with pytest.raises(RuntimeError, match="HTTPS"):
        create_app({**config, "PUBLIC_ORIGIN": "http://localhost"})
    with pytest.raises(RuntimeError, match="different"):
        create_app({**config, "AUDIT_KEY": "s" * 64})
    with pytest.raises(RuntimeError, match="32 characters"):
        create_app({**config, "SECRET_KEY": "short"})
    app = create_app({**config, "PUBLIC_ORIGIN": "https://localhost"})
    result = app.test_client().get("/api/session", base_url="https://localhost")
    assert "Secure" in result.headers["Set-Cookie"]
    assert result.headers["Strict-Transport-Security"] == "max-age=31536000"


def test_proxy_headers_ignored_by_default(client):
    post(client, "/auth/demo")
    assert (
        client.get("/api/network/ping", headers={"X-Forwarded-Proto": "https"}).json["transport"]
        == "HTTP"
    )
