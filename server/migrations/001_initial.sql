CREATE TABLE users (
    id INTEGER PRIMARY KEY,
    name TEXT NOT NULL,
    email TEXT NOT NULL UNIQUE,
    password_hash TEXT NOT NULL,
    demo INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL
);
CREATE TABLE households (
    id INTEGER PRIMARY KEY,
    name TEXT NOT NULL,
    owner_id INTEGER NOT NULL REFERENCES users(id),
    invite_hash TEXT UNIQUE,
    invite_expires INTEGER,
    created_at TEXT NOT NULL
);
CREATE TABLE members (
    household_id INTEGER NOT NULL REFERENCES households(id),
    user_id INTEGER NOT NULL UNIQUE REFERENCES users(id),
    PRIMARY KEY (household_id, user_id)
);
CREATE TABLE sessions (
    token_hash TEXT PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id),
    expires INTEGER NOT NULL
);
CREATE TABLE expenses (
    id INTEGER PRIMARY KEY,
    household_id INTEGER NOT NULL REFERENCES households(id),
    creator_id INTEGER NOT NULL REFERENCES users(id),
    title TEXT NOT NULL,
    category TEXT NOT NULL CHECK (category IN ('Home', 'Groceries', 'Utilities', 'Transport', 'Other')),
    amount INTEGER NOT NULL CHECK (amount > 0 AND amount <= 100000000),
    note TEXT NOT NULL DEFAULT '',
    incurred_on TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'archived')),
    created_at TEXT NOT NULL
);
CREATE TABLE shares (
    expense_id INTEGER NOT NULL REFERENCES expenses(id),
    user_id INTEGER NOT NULL REFERENCES users(id),
    amount INTEGER NOT NULL CHECK (amount >= 0),
    state TEXT NOT NULL CHECK (state IN ('pending', 'submitted', 'confirmed')),
    PRIMARY KEY (expense_id, user_id)
);
CREATE TABLE receipts (
    expense_id INTEGER PRIMARY KEY REFERENCES expenses(id),
    data BLOB NOT NULL,
    sha256 TEXT NOT NULL
);
CREATE TABLE events (
    id INTEGER PRIMARY KEY,
    household_id INTEGER NOT NULL REFERENCES households(id),
    actor_id INTEGER NOT NULL REFERENCES users(id),
    action TEXT NOT NULL,
    payload TEXT NOT NULL,
    created_at TEXT NOT NULL,
    previous_hash TEXT NOT NULL,
    hash TEXT NOT NULL
);
CREATE TABLE idempotency (
    user_id INTEGER NOT NULL REFERENCES users(id),
    key TEXT NOT NULL,
    fingerprint TEXT NOT NULL,
    response TEXT NOT NULL,
    PRIMARY KEY (user_id, key)
);
CREATE TABLE rate_limits (
    key TEXT PRIMARY KEY,
    count INTEGER NOT NULL,
    expires INTEGER NOT NULL
);
CREATE TABLE reset_tokens (
    token_hash TEXT PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id),
    expires INTEGER NOT NULL
);
CREATE INDEX events_house_cursor ON events(household_id, id);
CREATE INDEX expenses_house_date ON expenses(household_id, incurred_on DESC);
CREATE INDEX sessions_expiry ON sessions(expires);
CREATE INDEX limits_expiry ON rate_limits(expires);
