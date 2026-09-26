import pytest

from server import create_app


@pytest.fixture
def app(tmp_path):
    return create_app(
        {
            "TESTING": True,
            "DATABASE": str(tmp_path / "test.db"),
            "SECRET_KEY": "s" * 64,
            "AUDIT_KEY": "a" * 64,
            "DEMO_ENABLED": True,
        }
    )


@pytest.fixture
def client(app):
    return app.test_client()


def post(client, path, data=None, **kwargs):
    token = client.get("/api/session").json["csrf"]
    headers = {"X-CSRF-Token": token, **kwargs.pop("headers", {})}
    return client.post("/api" + path, json=data or {}, headers=headers, **kwargs)


def register(client, email="alex@example.test", name="Alex Morgan"):
    result = post(
        client, "/auth/register", {"name": name, "email": email, "password": "a long test password"}
    )
    assert result.status_code == 201, result.json
    return client.get("/api/session").json["user"]["id"]


@pytest.fixture
def household_clients(app):
    owner, member, outsider = [app.test_client() for _ in range(3)]
    owner_id = register(owner)
    assert post(owner, "/household", {"name": "Maple House"}).status_code == 201
    invitation = post(owner, "/household/invite").json["code"]
    member_id = register(member, "jamie@example.test", "Jamie Chen")
    assert post(member, "/household/join", {"code": invitation}).status_code == 200
    outsider_id = register(outsider, "other@example.test", "Other Person")
    assert post(outsider, "/household", {"name": "Elsewhere"}).status_code == 201
    return owner, member, outsider, owner_id, member_id, outsider_id


def expense(client, weights, amount=1001, key="test-expense-key-0001", **extra):
    payload = {
        "title": "Shared dinner",
        "amount": amount,
        "category": "Groceries",
        "incurred_on": "2026-01-02",
        "weights": {str(k): v for k, v in weights.items()},
        **extra,
    }
    return post(client, "/expenses", payload, headers={"Idempotency-Key": key})
