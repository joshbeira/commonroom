"""Explicit, isolated synthetic workspaces. Never enabled in production."""

import secrets
from datetime import date, timedelta

from .ledger import now, record_event, split_pennies


def seed_demo(db):
    ids = []
    for name in ("Alex Morgan", "Jamie Chen", "Sam Taylor", "Riley Park"):
        uid = db.execute(
            "INSERT INTO users (name,email,password_hash,demo,created_at) VALUES (?,?,?,1,?)",
            (name, f"{secrets.token_hex(12)}@demo.invalid", "!no-password-login", now()),
        ).lastrowid
        ids.append(uid)
    house = db.execute(
        "INSERT INTO households (name,owner_id,created_at) VALUES (?,?,?)",
        ("The Maple House", ids[0], now()),
    ).lastrowid
    db.executemany("INSERT INTO members VALUES (?,?)", [(house, uid) for uid in ids])
    record_event(db, house, ids[0], "household.created", {"name": "The Maple House"})
    samples = [
        ("September rent", "Home", 168000, 0, 24, True),
        ("Weekend food shop", "Groceries", 8640, 1, 20, True),
        ("The good coffee", "Groceries", 2400, 2, 16, True),
        ("Electricity & gas", "Utilities", 12840, 0, 12, False),
        ("A little green for the living room", "Home", 4800, 3, 9, True),
        ("Internet · September", "Utilities", 3600, 1, 6, False),
        ("Sunday dinner ingredients", "Groceries", 6728, 0, 3, False),
        ("Ride home together", "Transport", 2850, 2, 1, False),
    ]
    for title, category, amount, payer, days, settled in samples:
        incurred = (date.today() - timedelta(days=days)).isoformat()
        eid = db.execute(
            "INSERT INTO expenses (household_id,creator_id,title,category,amount,note,incurred_on,created_at) VALUES (?,?,?,?,?,?,?,?)",
            (
                house,
                ids[payer],
                title,
                category,
                amount,
                "A shared home, a fair share.",
                incurred,
                now(),
            ),
        ).lastrowid
        for uid, share in split_pennies(amount, dict.fromkeys(ids, 1)).items():
            state = "confirmed" if settled or uid == ids[payer] else "pending"
            if title == "Electricity & gas" and uid == ids[1]:
                state = "submitted"
            db.execute("INSERT INTO shares VALUES (?,?,?,?)", (eid, uid, share, state))
        record_event(
            db,
            house,
            ids[payer],
            "expense.created",
            {"id": eid, "title": title, "amount": amount, "synthetic": True},
        )
    return ids[0]
