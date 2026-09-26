import random

import pytest

from server.ledger import settlement_plan, split_pennies


def test_deterministic_remainder():
    assert split_pennies(100, {3: 1, 2: 1, 1: 1}) == {1: 34, 2: 33, 3: 33}


def test_weighted_split():
    assert split_pennies(1000, {1: 2, 2: 1}) == {1: 667, 2: 333}


@pytest.mark.parametrize("amount", [0, -1, 1.2, True, "100", 100_000_001, None])
def test_rejects_invalid_money(amount):
    with pytest.raises(ValueError):
        split_pennies(amount, {1: 1})


@pytest.mark.parametrize("weights", [{}, {1: 0}, {1: -1}, {1: 1.5}, {1: True}, {1: 101}])
def test_rejects_invalid_weights(weights):
    with pytest.raises(ValueError):
        split_pennies(100, weights)


def test_split_conservation_for_varied_weights():
    rng = random.Random(57)
    for _ in range(500):
        amount = rng.randint(1, 100_000_000)
        weights = {i: rng.randint(1, 100) for i in range(rng.randint(1, 12))}
        result = split_pennies(amount, weights)
        assert sum(result.values()) == amount
        assert all(value >= 0 for value in result.values())
        for uid, value in result.items():
            numerator = amount * weights[uid]
            assert value in (
                numerator // sum(weights.values()),
                -(-numerator // sum(weights.values())),
            )


def test_settlement_preserves_every_balance():
    balances = {1: 2711, 2: -3800, 3: 1089, 4: 0}
    remaining = balances.copy()
    transfers = settlement_plan(balances)
    for transfer in transfers:
        remaining[transfer["from"]] += transfer["amount"]
        remaining[transfer["to"]] -= transfer["amount"]
    assert all(value == 0 for value in remaining.values())
    assert len(transfers) <= len(balances) - 1
    assert balances == {1: 2711, 2: -3800, 3: 1089, 4: 0}
