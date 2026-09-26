CREATE TABLE stream_leases (
    id TEXT PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id),
    expires INTEGER NOT NULL
);
CREATE INDEX stream_expiry ON stream_leases(expires);
