import io
from concurrent.futures import ThreadPoolExecutor

from PIL import Image, PngImagePlugin

from server.db import get_db

from .conftest import expense, post


def test_complete_payment_lifecycle(household_clients):
    owner, member, _, oid, mid, _ = household_clients
    eid = expense(owner, {oid: 1, mid: 1}).json["id"]
    workspace = owner.get("/api/workspace").json
    assert sum(workspace["balances"].values()) == 0
    assert workspace["balances"][str(oid)] == 500
    assert post(owner, f"/expenses/{eid}/archive").status_code == 409
    assert post(member, f"/expenses/{eid}/shares/{mid}", {"action": "confirm"}).status_code == 403
    assert post(owner, f"/expenses/{eid}/shares/{mid}", {"action": "confirm"}).status_code == 409
    assert post(member, f"/expenses/{eid}/shares/{mid}", {"action": "submit"}).status_code == 200
    assert post(owner, f"/expenses/{eid}/shares/{mid}", {"action": "reject"}).status_code == 200
    assert post(member, f"/expenses/{eid}/shares/{mid}", {"action": "submit"}).status_code == 200
    assert post(owner, f"/expenses/{eid}/shares/{mid}", {"action": "confirm"}).status_code == 200
    assert post(owner, f"/expenses/{eid}/shares/{mid}", {"action": "confirm"}).json["replayed"]
    workspace = owner.get("/api/workspace").json
    assert workspace["expenses"][0]["settled"]
    assert all(v == 0 for v in workspace["balances"].values())
    assert workspace["audit"]["valid"]
    assert post(member, f"/expenses/{eid}/archive").status_code == 403
    assert post(owner, f"/expenses/{eid}/archive").status_code == 200
    assert post(member, f"/expenses/{eid}/shares/{mid}", {"action": "submit"}).status_code == 409


def test_idempotency_and_conflict(household_clients):
    owner, _, _, oid, mid, _ = household_clients
    first = expense(owner, {oid: 1, mid: 1})
    second = expense(owner, {oid: 1, mid: 1})
    assert first.status_code == 201 and second.status_code == 200
    assert first.json == second.json
    assert expense(owner, {oid: 1, mid: 1}, amount=2000).status_code == 409
    assert len(owner.get("/api/workspace").json["expenses"]) == 1


def test_concurrent_duplicate_requests(app, household_clients):
    owner, _, _, oid, mid, _ = household_clients
    cookie = owner.get_cookie("commonroom_session").value

    def submit(_):
        client = app.test_client()
        client.set_cookie("commonroom_session", cookie)
        return expense(client, {oid: 1, mid: 1})

    with ThreadPoolExecutor(max_workers=4) as pool:
        responses = list(pool.map(submit, range(4)))
    assert sorted(r.status_code for r in responses) == [200, 200, 200, 201]
    assert len({r.json["id"] for r in responses}) == 1
    assert owner.get("/api/workspace").json["audit"]["valid"]


def test_audit_tampering_detected(app, household_clients):
    owner, _, _, oid, mid, _ = household_clients
    expense(owner, {oid: 1, mid: 1})
    assert owner.get("/api/workspace").json["audit"]["valid"]
    with app.app_context():
        get_db().execute("UPDATE events SET payload='{}' WHERE action='expense.created'")
    assert not owner.get("/api/workspace").json["audit"]["valid"]


def test_sse_resume_and_tenant_filter(household_clients):
    owner, _, outsider, oid, mid, _ = household_clients
    cursor = owner.get("/api/workspace").json["events"][0]["id"]
    expense(owner, {oid: 1, mid: 1})
    stream = owner.get("/api/events", headers={"Last-Event-ID": str(cursor)})
    assert stream.mimetype == "text/event-stream"
    assert stream.headers["X-Accel-Buffering"] == "no"
    assert stream.data.count(b"event: change") == 1
    assert b"expense.created" in stream.data
    assert b"expense.created" not in outsider.get("/api/events").data
    assert owner.get("/api/events?after=bad").status_code == 400


def test_receipt_reencoding_and_access(household_clients):
    owner, member, outsider, oid, mid, _ = household_clients
    eid = expense(owner, {oid: 1, mid: 1}).json["id"]
    token = owner.get("/api/session").json["csrf"]
    image = io.BytesIO()
    metadata = PngImagePlugin.PngInfo()
    metadata.add_text("secret", "metadata to strip")
    Image.new("RGB", (5, 5), "green").save(image, format="PNG", pnginfo=metadata)
    image.seek(0)
    response = owner.post(
        f"/api/expenses/{eid}/receipt",
        data={"receipt": (image, "receipt.png")},
        headers={"X-CSRF-Token": token},
    )
    assert response.status_code == 201
    decoded = member.get(f"/api/expenses/{eid}/receipt")
    assert decoded.status_code == 200
    assert "secret" not in Image.open(io.BytesIO(decoded.data)).info
    assert outsider.get(f"/api/expenses/{eid}/receipt").status_code == 404
    assert b"metadata to strip" not in decoded.data


def test_receipt_rejects_disguised_html(household_clients):
    owner, _, _, oid, mid, _ = household_clients
    eid = expense(owner, {oid: 1, mid: 1}).json["id"]
    token = owner.get("/api/session").json["csrf"]
    response = owner.post(
        f"/api/expenses/{eid}/receipt",
        data={"receipt": (io.BytesIO(b"<script>alert(1)</script>"), "photo.png")},
        headers={"X-CSRF-Token": token},
    )
    assert response.status_code == 400


def test_csv_formula_injection_neutralized(household_clients):
    owner, _, _, oid, _, _ = household_clients
    expense(owner, {oid: 1}, title='=HYPERLINK("https://example.test")')
    response = owner.get("/api/export")
    assert response.status_code == 200
    assert "'=HYPERLINK" in response.text
    assert "10.01" in response.text


def test_request_validation(household_clients):
    owner, _, _, oid, mid, _ = household_clients
    assert expense(owner, {oid: 1}, category="bad").status_code == 400
    assert expense(owner, {oid: 1}, incurred_on="9999-01-01").status_code == 400
    assert expense(owner, {oid: 1}, amount=True).status_code == 400
    assert expense(owner, {oid: 1}, key="short").status_code == 400
    assert expense(owner, {oid: 1, mid: 0}).status_code == 400
    assert expense(owner, {oid: 1}, title="' OR 1=1; --").status_code == 201


def test_zero_value_share_is_confirmed(household_clients):
    owner, _, _, oid, mid, _ = household_clients
    assert expense(owner, {oid: 100, mid: 1}, amount=1).status_code == 201
    data = owner.get("/api/workspace").json
    assert data["expenses"][0]["settled"]


def test_health_and_network(client):
    assert client.get("/healthz").json["status"] == "ok"
    post(client, "/auth/demo")
    response = client.get("/api/network/ping")
    assert response.json["transport"] == "HTTP"
    assert response.json["request_id"] == response.headers["X-Request-ID"]
