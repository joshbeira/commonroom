import csv
import hashlib
import io
import json
import os
import re
import secrets
import smtplib
import sqlite3
import ssl
import time
import warnings
from datetime import date
from email.message import EmailMessage

from flask import Blueprint, Response, abort, current_app, g, request, session
from PIL import Image, UnidentifiedImageError
from werkzeug.security import check_password_hash, generate_password_hash

from .db import connect, get_db, transaction
from .demo import seed_demo
from .ledger import canonical, now, record_event, settlement_plan, split_pennies, verify_events
from .security import body, digest, household, limited, login, require_user, text_field

api = Blueprint("api", __name__)
DUMMY_HASH = generate_password_hash(secrets.token_urlsafe(32))


def user_json(user):
    return {key: user[key] for key in ("id", "name", "email", "demo")}


@api.get("/session")
def get_session():
    session.setdefault("csrf", secrets.token_urlsafe(32))
    return {
        "csrf": session["csrf"],
        "user": user_json(g.user) if g.user else None,
        "demo_enabled": current_app.config["DEMO_ENABLED"],
        "recovery_enabled": bool(os.getenv("SMTP_HOST")),
    }


@api.post("/auth/register")
@limited("register", 10, 3600)
def register():
    data = body()
    name = text_field(data, "name", 2, 60)
    email = text_field(data, "email", 3, 254).lower()
    password = text_field(data, "password", 12, 128)
    if not re.fullmatch(r"[^\s@]+@[^\s@]+\.[^\s@]+", email):
        abort(400, "Enter a valid email address.")
    password_hash = generate_password_hash(password)
    try:
        with transaction() as db:
            uid = db.execute(
                "INSERT INTO users (name,email,password_hash,created_at) VALUES (?,?,?,?)",
                (name, email, password_hash, now()),
            ).lastrowid
            login(uid)
    except sqlite3.IntegrityError:
        abort(
            409, "Unable to register with those details. Try signing in or recovering your account."
        )
    return {"csrf": session["csrf"]}, 201


@api.post("/auth/login")
@limited("login", 10, 300)
def sign_in():
    data = body()
    email = text_field(data, "email", 3, 254).lower()
    password = text_field(data, "password", 1, 128)
    user = get_db().execute("SELECT * FROM users WHERE email=? AND demo=0", (email,)).fetchone()
    valid = check_password_hash(user["password_hash"] if user else DUMMY_HASH, password)
    if not user or not valid:
        abort(401, "Email or password is incorrect.")
    with transaction() as db:
        login(user["id"])
        member = db.execute(
            "SELECT household_id FROM members WHERE user_id=?", (user["id"],)
        ).fetchone()
        if member:
            record_event(db, member[0], user["id"], "session.started", {"method": "password"})
    return {"csrf": session["csrf"]}


@api.post("/auth/demo")
@limited("demo", 5, 3600)
def demo():
    if not current_app.config["DEMO_ENABLED"]:
        abort(404)
    with transaction() as db:
        login(seed_demo(db))
    return {"csrf": session["csrf"]}, 201


@api.post("/auth/logout")
@require_user
def logout():
    with transaction() as db:
        db.execute("DELETE FROM sessions WHERE token_hash=?", (digest(session["sid"]),))
    session.clear()
    return {"ok": True}


@api.post("/auth/recover")
@limited("recover", 5, 900)
def recover():
    email = text_field(body(), "email", 3, 254).lower()
    user = get_db().execute("SELECT * FROM users WHERE email=? AND demo=0", (email,)).fetchone()
    if not os.getenv("SMTP_HOST"):
        abort(503, "Account recovery is not configured on this installation.")
    if user:
        token = secrets.token_urlsafe(32)
        with transaction() as db:
            db.execute(
                "DELETE FROM reset_tokens WHERE user_id=? OR expires<?",
                (user["id"], int(time.time())),
            )
            db.execute(
                "INSERT INTO reset_tokens VALUES (?,?,?)",
                (digest(token), user["id"], int(time.time()) + 1800),
            )
        message = EmailMessage()
        message["From"], message["To"], message["Subject"] = (
            os.environ["SMTP_FROM"],
            email,
            "Reset your Commonroom password",
        )
        message.set_content(
            f"Reset your password within 30 minutes:\n{current_app.config['PUBLIC_ORIGIN']}/?reset={token}\n\nIf you did not request this, ignore this email."
        )
        try:
            with smtplib.SMTP(
                os.environ["SMTP_HOST"], int(os.getenv("SMTP_PORT", "587")), timeout=10
            ) as smtp:
                smtp.starttls(context=ssl.create_default_context())
                if os.getenv("SMTP_USER"):
                    smtp.login(os.environ["SMTP_USER"], os.environ["SMTP_PASSWORD"])
                smtp.send_message(message)
        except (OSError, smtplib.SMTPException):
            current_app.logger.error("Password recovery mail delivery failed")
    return {"message": "If that account exists, a recovery link will be sent."}


@api.post("/auth/reset")
@limited("reset", 10, 900)
def reset():
    data = body()
    token = text_field(data, "token", 20, 100)
    password_hash = generate_password_hash(text_field(data, "password", 12, 128))
    with transaction() as db:
        row = db.execute(
            "SELECT * FROM reset_tokens WHERE token_hash=? AND expires>?",
            (digest(token), int(time.time())),
        ).fetchone()
        if not row:
            abort(400, "This reset link is invalid or has expired.")
        db.execute("UPDATE users SET password_hash=? WHERE id=?", (password_hash, row["user_id"]))
        db.execute("DELETE FROM sessions WHERE user_id=?", (row["user_id"],))
        db.execute("DELETE FROM reset_tokens WHERE user_id=?", (row["user_id"],))
    session.clear()
    return {"ok": True}


@api.post("/household")
@require_user
def create_household():
    name = text_field(body(), "name", 2, 60)
    with transaction() as db:
        if db.execute("SELECT 1 FROM members WHERE user_id=?", (g.user["id"],)).fetchone():
            abort(409, "You already belong to a household.")
        hid = db.execute(
            "INSERT INTO households (name,owner_id,created_at) VALUES (?,?,?)",
            (name, g.user["id"], now()),
        ).lastrowid
        db.execute("INSERT INTO members VALUES (?,?)", (hid, g.user["id"]))
        record_event(db, hid, g.user["id"], "household.created", {"name": name})
    return {"id": hid}, 201


@api.post("/household/invite")
@require_user
def invite():
    house = household()
    if house["owner_id"] != g.user["id"] or g.user["demo"]:
        abort(403, "Only the owner of a real household can create invitations.")
    code = secrets.token_urlsafe(18)
    with transaction() as db:
        db.execute(
            "UPDATE households SET invite_hash=?,invite_expires=? WHERE id=?",
            (digest(code), int(time.time()) + 86400, house["id"]),
        )
        record_event(db, house["id"], g.user["id"], "invitation.rotated", {"expires_in_hours": 24})
    return {"code": code, "expires_in": 86400}


@api.post("/household/join")
@require_user
@limited("join", 10, 300)
def join():
    code = text_field(body(), "code", 10, 100)
    with transaction() as db:
        if db.execute("SELECT 1 FROM members WHERE user_id=?", (g.user["id"],)).fetchone():
            abort(409, "You already belong to a household.")
        house = db.execute(
            "SELECT * FROM households WHERE invite_hash=? AND invite_expires>?",
            (digest(code), int(time.time())),
        ).fetchone()
        if not house:
            abort(400, "This invitation is invalid or has expired.")
        if (
            db.execute(
                "SELECT COUNT(*) FROM members WHERE household_id=?", (house["id"],)
            ).fetchone()[0]
            >= 12
        ):
            abort(409, "This household has reached its 12-member limit.")
        db.execute("INSERT INTO members VALUES (?,?)", (house["id"], g.user["id"]))
        record_event(db, house["id"], g.user["id"], "member.joined", {"name": g.user["name"]})
    return {"ok": True}


def expense_rows(hid):
    db = get_db()
    expenses = [
        dict(row)
        for row in db.execute(
            "SELECT e.*,u.name AS payer,EXISTS(SELECT 1 FROM receipts r WHERE r.expense_id=e.id) AS receipt FROM expenses e JOIN users u ON u.id=e.creator_id WHERE household_id=? ORDER BY incurred_on DESC,e.id DESC",
            (hid,),
        )
    ]
    shares = db.execute(
        "SELECT s.* FROM shares s JOIN expenses e ON e.id=s.expense_id WHERE e.household_id=?",
        (hid,),
    ).fetchall()
    grouped = {}
    for share in shares:
        grouped.setdefault(share["expense_id"], []).append(dict(share))
    for expense in expenses:
        expense["shares"] = grouped.get(expense["id"], [])
        expense["settled"] = all(s["state"] == "confirmed" for s in expense["shares"])
    return expenses


@api.get("/workspace")
@require_user
def workspace():
    db = get_db()
    membership = db.execute("SELECT 1 FROM members WHERE user_id=?", (g.user["id"],)).fetchone()
    if not membership:
        return {"household": None}
    house = household()
    members = [
        dict(row)
        for row in db.execute(
            "SELECT u.id,u.name FROM users u JOIN members m ON m.user_id=u.id WHERE m.household_id=? ORDER BY u.id",
            (house["id"],),
        )
    ]
    expenses = expense_rows(house["id"])
    balances = {member["id"]: 0 for member in members}
    for expense in expenses:
        if expense["status"] == "archived":
            continue
        for share in expense["shares"]:
            if share["state"] != "confirmed":
                balances[share["user_id"]] -= share["amount"]
                balances[expense["creator_id"]] += share["amount"]
    events = [
        dict(row)
        for row in db.execute(
            "SELECT e.*,u.name AS actor FROM events e JOIN users u ON u.id=e.actor_id WHERE e.household_id=? ORDER BY e.id",
            (house["id"],),
        )
    ]
    return {
        "household": {"id": house["id"], "name": house["name"], "owner_id": house["owner_id"]},
        "members": members,
        "expenses": expenses,
        "balances": balances,
        "transfers": settlement_plan(balances),
        "events": events[-100:][::-1],
        "audit": {
            "valid": verify_events(events),
            "count": len(events),
            "head": events[-1]["hash"] if events else None,
        },
    }


@api.post("/expenses")
@require_user
@limited("expenses", 60, 60)
def create_expense():
    house, data = household(), body()
    title = text_field(data, "title", 1, 100)
    note = text_field(data, "note", 0, 500)
    category = data.get("category")
    if category not in ("Home", "Groceries", "Utilities", "Transport", "Other"):
        abort(400, "Choose a valid category.")
    try:
        incurred = date.fromisoformat(data.get("incurred_on", ""))
        if incurred > date.today():
            raise ValueError
    except (ValueError, TypeError):
        abort(400, "Choose a valid expense date, no later than today.")
    raw_weights = data.get("weights")
    if (
        not isinstance(raw_weights, dict)
        or not raw_weights
        or len(raw_weights) > 12
        or any(not re.fullmatch(r"[1-9][0-9]{0,9}", key) for key in raw_weights)
    ):
        abort(400, "Select household members to split with.")
    weights = {int(uid): weight for uid, weight in raw_weights.items()}
    try:
        allocations = split_pennies(data.get("amount"), weights)
    except ValueError as error:
        abort(400, str(error))
    key = request.headers.get("Idempotency-Key", "")
    if not re.fullmatch(r"[a-zA-Z0-9-]{16,80}", key):
        abort(400, "Provide an Idempotency-Key of 16–80 alphanumeric characters or hyphens.")
    fingerprint = digest(canonical(data))
    with transaction() as db:
        previous = db.execute(
            "SELECT * FROM idempotency WHERE user_id=? AND key=?", (g.user["id"], key)
        ).fetchone()
        if previous:
            if previous["fingerprint"] != fingerprint:
                abort(409, "This request key has already been used with different content.")
            return json.loads(previous["response"]), 200
        allowed = {
            row[0]
            for row in db.execute(
                "SELECT user_id FROM members WHERE household_id=?", (house["id"],)
            )
        }
        if not weights.keys() <= allowed:
            abort(400, "Every participant must belong to your household.")
        eid = db.execute(
            "INSERT INTO expenses (household_id,creator_id,title,category,amount,note,incurred_on,created_at) VALUES (?,?,?,?,?,?,?,?)",
            (
                house["id"],
                g.user["id"],
                title,
                category,
                data["amount"],
                note,
                incurred.isoformat(),
                now(),
            ),
        ).lastrowid
        for uid, amount in allocations.items():
            state = "confirmed" if uid == g.user["id"] or amount == 0 else "pending"
            db.execute("INSERT INTO shares VALUES (?,?,?,?)", (eid, uid, amount, state))
        result = {"id": eid}
        record_event(
            db,
            house["id"],
            g.user["id"],
            "expense.created",
            {"id": eid, "title": title, "amount": data["amount"], "allocations": allocations},
        )
        db.execute(
            "INSERT INTO idempotency VALUES (?,?,?,?)",
            (g.user["id"], key, fingerprint, canonical(result)),
        )
    return result, 201


def authorized_expense(db, eid):
    house = household()
    expense = db.execute(
        "SELECT * FROM expenses WHERE id=? AND household_id=?", (eid, house["id"])
    ).fetchone()
    if not expense:
        abort(404, "Expense not found.")
    return expense


@api.post("/expenses/<int:eid>/shares/<int:uid>")
@require_user
def payment(eid, uid):
    action = body().get("action")
    with transaction() as db:
        expense = authorized_expense(db, eid)
        if expense["status"] != "open":
            abort(409, "This expense has been archived.")
        share = db.execute(
            "SELECT * FROM shares WHERE expense_id=? AND user_id=?", (eid, uid)
        ).fetchone()
        if not share or uid == expense["creator_id"]:
            abort(404, "Payable share not found.")
        if action == "submit" and uid == g.user["id"]:
            old_state, new_state = "pending", "submitted"
        elif action in ("confirm", "reject") and expense["creator_id"] == g.user["id"]:
            old_state, new_state = "submitted", "confirmed" if action == "confirm" else "pending"
        else:
            abort(403, "You cannot perform this payment action.")
        if share["state"] == new_state:
            return {"ok": True, "replayed": True}
        if share["state"] != old_state:
            abort(409, "The payment has changed. Refresh and try again.")
        db.execute(
            "UPDATE shares SET state=? WHERE expense_id=? AND user_id=?", (new_state, eid, uid)
        )
        record_event(
            db,
            expense["household_id"],
            g.user["id"],
            f"payment.{new_state}",
            {
                "expense_id": eid,
                "title": expense["title"],
                "member_id": uid,
                "amount": share["amount"],
            },
        )
    return {"ok": True}


@api.post("/expenses/<int:eid>/archive")
@require_user
def archive(eid):
    with transaction() as db:
        expense = authorized_expense(db, eid)
        if expense["creator_id"] != g.user["id"]:
            abort(403, "Only the expense creator can archive it.")
        if db.execute(
            "SELECT 1 FROM shares WHERE expense_id=? AND state!='confirmed'", (eid,)
        ).fetchone():
            abort(409, "Settle every share before archiving this expense.")
        if expense["status"] != "archived":
            db.execute("UPDATE expenses SET status='archived' WHERE id=?", (eid,))
            record_event(
                db,
                expense["household_id"],
                g.user["id"],
                "expense.archived",
                {"id": eid, "title": expense["title"]},
            )
    return {"ok": True}


@api.post("/expenses/<int:eid>/receipt")
@require_user
@limited("uploads", 20, 60)
def upload_receipt(eid):
    expense = authorized_expense(get_db(), eid)
    if expense["creator_id"] != g.user["id"]:
        abort(403, "Only the expense creator can attach a receipt.")
    file = request.files.get("receipt")
    if file is None:
        abort(400, "Select a JPEG or PNG receipt.")
    try:
        with warnings.catch_warnings():
            warnings.simplefilter("error", Image.DecompressionBombWarning)
            with Image.open(file.stream) as image:
                if image.format not in ("JPEG", "PNG") or image.width * image.height > 16_000_000:
                    raise ValueError
                image.load()
                image.thumbnail((2200, 2200))
                output = io.BytesIO()
                image.convert("RGB").save(output, format="PNG")
    except (
        UnidentifiedImageError,
        OSError,
        ValueError,
        Image.DecompressionBombError,
        Image.DecompressionBombWarning,
    ):
        abort(400, "Use a valid JPEG or PNG, up to 5 MB and 16 megapixels.")
    blob = output.getvalue()
    if len(blob) > 5 * 1024 * 1024:
        abort(400, "The decoded receipt is too large.")
    with transaction() as db:
        if db.execute("SELECT 1 FROM receipts WHERE expense_id=?", (eid,)).fetchone():
            abort(409, "A receipt is already attached; evidence cannot be overwritten.")
        db.execute(
            "INSERT INTO receipts VALUES (?,?,?)", (eid, blob, hashlib.sha256(blob).hexdigest())
        )
        record_event(
            db,
            expense["household_id"],
            g.user["id"],
            "receipt.attached",
            {"expense_id": eid, "sha256": hashlib.sha256(blob).hexdigest()},
        )
    return {"ok": True}, 201


@api.get("/expenses/<int:eid>/receipt")
@require_user
def receipt(eid):
    authorized_expense(get_db(), eid)
    row = get_db().execute("SELECT data FROM receipts WHERE expense_id=?", (eid,)).fetchone()
    if not row:
        abort(404)
    return Response(
        row[0],
        mimetype="image/png",
        headers={"Content-Disposition": 'inline; filename="receipt.png"'},
    )


@api.get("/export")
@require_user
def export():
    output = io.StringIO()
    writer = csv.writer(output)
    writer.writerow(["Date", "Title", "Category", "Paid by", "Amount GBP", "Status"])
    for expense in expense_rows(household()["id"]):

        def safe(value):
            return (
                "'" + value
                if value.lstrip().startswith(("=", "+", "-", "@", "\t", "\r", "\n"))
                else value
            )

        pennies = expense["amount"]
        writer.writerow(
            [
                expense["incurred_on"],
                safe(expense["title"]),
                expense["category"],
                safe(expense["payer"]),
                f"{pennies // 100}.{pennies % 100:02d}",
                "settled" if expense["settled"] else expense["status"],
            ]
        )
    return Response(
        output.getvalue(),
        mimetype="text/csv",
        headers={"Content-Disposition": 'attachment; filename="commonroom-expenses.csv"'},
    )


@api.get("/network/ping")
@require_user
def ping():
    return {
        "time": now(),
        "request_id": g.request_id,
        "transport": "HTTPS" if request.is_secure else "HTTP",
        "upstream_protocol": request.environ.get("SERVER_PROTOCOL", "unknown"),
    }


@api.get("/events")
@require_user
@limited("streams", 60, 60)
def events():
    hid, path = household()["id"], current_app.config["DATABASE"]
    token_hash = digest(session["sid"])
    try:
        cursor = max(0, int(request.headers.get("Last-Event-ID", request.args.get("after", "0"))))
    except ValueError:
        abort(400, "Invalid event cursor.")
    lease = secrets.token_hex(16)
    with transaction() as db:
        db.execute("DELETE FROM stream_leases WHERE expires<=?", (int(time.time()),))
        total = db.execute("SELECT COUNT(*) FROM stream_leases").fetchone()[0]
        owned = db.execute(
            "SELECT COUNT(*) FROM stream_leases WHERE user_id=?", (g.user["id"],)
        ).fetchone()[0]
        if total >= 16 or owned >= 2:
            g.retry_after = 30
            abort(429, "Live connection limit reached. Close another tab and retry.")
        db.execute(
            "INSERT INTO stream_leases VALUES (?,?,?)", (lease, g.user["id"], int(time.time()) + 60)
        )

    testing = current_app.config.get("TESTING")

    def stream():
        nonlocal cursor
        # Bounded stream lifetime frees WSGI workers; EventSource reconnects with its cursor.
        yield "retry: 3000\n\n"
        started = time.monotonic()
        while time.monotonic() - started < 25:
            db = connect(path)
            try:
                active = db.execute(
                    "SELECT 1 FROM sessions s JOIN members m ON m.user_id=s.user_id WHERE s.token_hash=? AND s.expires>? AND m.household_id=?",
                    (token_hash, int(time.time()), hid),
                ).fetchone()
                if not active:
                    yield "event: expired\ndata: {}\n\n"
                    return
                rows = db.execute(
                    "SELECT id,action FROM events WHERE household_id=? AND id>? ORDER BY id LIMIT 100",
                    (hid, cursor),
                ).fetchall()
            finally:
                db.close()
            for row in rows:
                cursor = row["id"]
                yield f"id: {cursor}\nevent: change\ndata: {json.dumps({'action': row['action']})}\n\n"
            yield ": heartbeat\n\n"
            if testing:
                return
            time.sleep(2)

    def release():
        db = connect(path)
        try:
            db.execute("DELETE FROM stream_leases WHERE id=?", (lease,))
        finally:
            db.close()

    response = Response(stream(), mimetype="text/event-stream", headers={"X-Accel-Buffering": "no"})
    response.call_on_close(release)
    return response
