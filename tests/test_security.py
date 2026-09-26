import time

import pytest

from server.db import get_db
from server.security import digest

from .conftest import expense, post, register


def test_csrf_required_even_for_login(client):
    assert client.post("/api/auth/login", json={}).status_code == 403
    client.get("/api/session")
    assert (
        client.post("/api/auth/login", json={}, headers={"X-CSRF-Token": "wrong"}).status_code
        == 403
    )


def test_cross_site_mutation_rejected(client):
    assert post(client, "/auth/demo", headers={"Sec-Fetch-Site": "cross-site"}).status_code == 403


@pytest.mark.parametrize(
    "path", ["/workspace", "/export", "/network/ping", "/events", "/expenses/1/receipt"]
)
def test_anonymous_read_denied(client, path):
    assert client.get("/api" + path).status_code == 401


def test_cookie_and_security_headers(client):
    response = client.get("/api/session")
    assert "HttpOnly" in response.headers["Set-Cookie"]
    assert "SameSite=Lax" in response.headers["Set-Cookie"]
    assert "script-src 'self'" in response.headers["Content-Security-Policy"]
    assert response.headers["X-Content-Type-Options"] == "nosniff"
    assert response.headers["Cache-Control"] == "no-store"
    assert "dur=" in response.headers["Server-Timing"]
    assert len(response.headers["X-Request-ID"]) == 16


def test_logout_revokes_copied_session(client):
    register(client)
    cookie = client.get_cookie("commonroom_session").value
    assert post(client, "/auth/logout").status_code == 200
    client.set_cookie("commonroom_session", cookie)
    assert client.get("/api/workspace").status_code == 401


def test_login_rotates_csrf(client):
    register(client)
    old = client.get("/api/session").json["csrf"]
    response = post(
        client, "/auth/login", {"email": "alex@example.test", "password": "a long test password"}
    )
    assert response.status_code == 200
    assert response.json["csrf"] != old


def test_login_throttled(client):
    for _ in range(10):
        assert (
            post(
                client, "/auth/login", {"email": "absent@example.test", "password": "bad"}
            ).status_code
            == 401
        )
    response = post(client, "/auth/login", {"email": "absent@example.test", "password": "bad"})
    assert response.status_code == 429
    assert int(response.headers["Retry-After"]) > 0


def test_household_isolation(household_clients):
    owner, member, outsider, oid, mid, xid = household_clients
    eid = expense(owner, {oid: 1, mid: 1}).json["id"]
    assert outsider.get("/api/workspace").json["expenses"] == []
    assert outsider.get(f"/api/expenses/{eid}/receipt").status_code == 404
    assert post(outsider, f"/expenses/{eid}/shares/{mid}", {"action": "confirm"}).status_code == 404
    assert expense(owner, {oid: 1, xid: 1}, key="another-expense-key-0002").status_code == 400
    assert post(member, "/household/invite").status_code == 403


def test_invite_revoked_and_expired(app, household_clients):
    owner, _, _, _, _, _ = household_clients
    old = post(owner, "/household/invite").json["code"]
    new = post(owner, "/household/invite").json["code"]
    newcomer = app.test_client()
    register(newcomer, "new@example.test")
    assert post(newcomer, "/household/join", {"code": old}).status_code == 400
    with app.app_context():
        get_db().execute("UPDATE households SET invite_expires=0")
    assert post(newcomer, "/household/join", {"code": new}).status_code == 400


def test_expired_sessions_denied(app, client):
    register(client)
    with app.app_context():
        get_db().execute("UPDATE sessions SET expires=0")
    assert client.get("/api/workspace").status_code == 401


def test_reset_single_use_and_revokes_sessions(app, client):
    uid = register(client)
    old_cookie = client.get_cookie("commonroom_session").value
    token = "test-recovery-token-long-enough"
    with app.app_context():
        get_db().execute(
            "INSERT INTO reset_tokens VALUES (?,?,?)", (digest(token), uid, int(time.time()) + 60)
        )
    payload = {"token": token, "password": "a different long password"}
    assert post(client, "/auth/reset", payload).status_code == 200
    assert post(client, "/auth/reset", payload).status_code == 400
    client.set_cookie("commonroom_session", old_cookie)
    assert client.get("/api/workspace").status_code == 401
    assert (
        post(
            client,
            "/auth/login",
            {"email": "alex@example.test", "password": "a different long password"},
        ).status_code
        == 200
    )


def test_demo_isolation(app):
    first, second = app.test_client(), app.test_client()
    post(first, "/auth/demo")
    post(second, "/auth/demo")
    a, b = first.get("/api/workspace").json, second.get("/api/workspace").json
    assert a["household"]["id"] != b["household"]["id"]
    assert {e["id"] for e in a["expenses"]}.isdisjoint({e["id"] for e in b["expenses"]})
    assert post(first, "/household/invite").status_code == 403


def test_untrusted_host_rejected(client):
    assert client.get("/api/session", headers={"Host": "evil.example"}).status_code == 400


def test_long_password_and_invalid_json_rejected(client):
    assert (
        post(
            client, "/auth/register", {"name": "Alex", "email": "a@b.test", "password": "x" * 129}
        ).status_code
        == 400
    )
    assert post(client, "/auth/register", ["not an object"]).status_code == 400
