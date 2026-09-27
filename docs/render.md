# Free hosting with persistent data

The `codex/free-hosting` branch has a Render Blueprint using the free web-service
plan and a Turso **libSQL** database. Use the libSQL engine, not the newer Turso
engine, because this application relies on SQLite's single-writer transactions.

Set `TURSO_DATABASE_URL` to the database's `libsql://` URL and
`TURSO_AUTH_TOKEN` to a database-scoped read/write token in Render's secret
environment settings. Never commit either credential. The Blueprint generates
independent, stable `SECRET_KEY` and `AUDIT_KEY` values; preserve those keys across
redeployments, particularly the audit key.

All database operations go directly to the remote primary. A successful commit
does not depend on Render's temporary filesystem. If the database is unavailable,
the application fails rather than silently writing an ephemeral local database.
Render production startup also refuses to run without the persistent database URL.

Use Turso's free plan with paid overages disabled. Render free services sleep
when idle and share the workspace's instance-hour allowance. Database data
remains at Turso across web-service restarts, subject to Turso's account policies
and free quotas. This setup is not a promise of unlimited storage or uptime.

The public origin and hostname are read from Render's own environment variables.
Secure cookies, host validation, CSRF protection, audit checks, and production
mode remain enabled. Anonymous synthetic demo generation remains disabled.

The local SQLite backup script is for local databases only. Use Turso's database
export and recovery facilities for the hosted database.
