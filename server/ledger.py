"""Pure integer accounting. No floating-point amounts enter the ledger."""

import hashlib
import hmac
import json
from datetime import datetime, timezone

from flask import current_app


def now():
    return datetime.now(timezone.utc).isoformat(timespec="seconds")


def split_pennies(amount, weights):
    """Largest-remainder allocation; equal remainders favour the smaller user ID."""
    if type(amount) is not int or not 0 < amount <= 100_000_000:
        raise ValueError("Amount must be a positive integer in pennies, up to £1,000,000.")
    if not weights or any(type(w) is not int or w < 1 or w > 100 for w in weights.values()):
        raise ValueError("Choose at least one member; weights must be integers from 1 to 100.")
    total = sum(weights.values())
    result = {uid: amount * weight // total for uid, weight in weights.items()}
    order = sorted(weights, key=lambda uid: (-(amount * weights[uid] % total), uid))
    for uid in order[: amount - sum(result.values())]:
        result[uid] += 1
    return result


def settlement_plan(balances):
    """Greedy debt simplification, at most n-1 transfers; not globally optimal."""
    creditors = [[uid, value] for uid, value in sorted(balances.items()) if value > 0]
    debtors = [[uid, -value] for uid, value in sorted(balances.items()) if value < 0]
    transfers = []
    while creditors and debtors:
        creditor, debtor = creditors[-1], debtors[-1]
        amount = min(creditor[1], debtor[1])
        transfers.append({"from": debtor[0], "to": creditor[0], "amount": amount})
        creditor[1] -= amount
        debtor[1] -= amount
        if not creditor[1]:
            creditors.pop()
        if not debtor[1]:
            debtors.pop()
    return transfers


def canonical(value):
    return json.dumps(value, sort_keys=True, separators=(",", ":"), ensure_ascii=True)


def event_hash(household_id, actor_id, action, payload, created_at, previous_hash):
    message = canonical([household_id, actor_id, action, payload, created_at, previous_hash])
    return hmac.new(
        current_app.config["AUDIT_KEY"].encode(), message.encode(), hashlib.sha256
    ).hexdigest()


def record_event(db, household_id, actor_id, action, payload):
    # Caller holds BEGIN IMMEDIATE, so two writers cannot fork the chain.
    previous = db.execute(
        "SELECT hash FROM events WHERE household_id=? ORDER BY id DESC LIMIT 1", (household_id,)
    ).fetchone()
    previous_hash = previous[0] if previous else "0" * 64
    timestamp, body = now(), canonical(payload)
    digest = event_hash(household_id, actor_id, action, body, timestamp, previous_hash)
    db.execute(
        "INSERT INTO events (household_id,actor_id,action,payload,created_at,previous_hash,hash) VALUES (?,?,?,?,?,?,?)",
        (household_id, actor_id, action, body, timestamp, previous_hash, digest),
    )


def verify_events(events):
    previous = "0" * 64
    for event in events:
        expected = event_hash(
            event["household_id"],
            event["actor_id"],
            event["action"],
            event["payload"],
            event["created_at"],
            previous,
        )
        if event["previous_hash"] != previous or not hmac.compare_digest(expected, event["hash"]):
            return False
        previous = event["hash"]
    return True
