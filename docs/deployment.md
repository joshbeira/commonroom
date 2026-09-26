# Running Commonroom

## Local development

The root `compose.yaml` binds port 8000 to `127.0.0.1`, enables synthetic demo workspaces, and persists the SQLite database and development keys in a named volume. It is intentionally a local configuration.

The source setup uses `python -m server`, a 24-thread Waitress server bound to loopback. The frontend is served from `web/dist`; run `pnpm build` after changes or use `pnpm dev` for Vite hot reloading.

## HTTPS deployment

The separate `deploy/compose.production.yaml` starts the application behind Caddy. The application port is not published. Caddy obtains and renews a certificate for a domain you control. Provisioning a domain or server is outside the repository's deployment scripts.

1. Point a domain's A/AAAA records at your server. Allow inbound TCP 80/443 and, optionally, UDP 443 for HTTP/3.
2. Copy `.env.example` to `.env`. Generate **two independent values** using `python -c "import secrets; print(secrets.token_hex(32))"` and set `SECRET_KEY` and `AUDIT_KEY`.
3. Set the following values, replacing the sample hostname:

```dotenv
APP_ENV=production
DEMO_ENABLED=false
PUBLIC_ORIGIN=https://home.example.com
TRUSTED_HOSTS=home.example.com,localhost,127.0.0.1
TRUST_PROXY=true
```

4. From the repository root, launch the deployment:

```sh
DOMAIN=home.example.com docker compose -f deploy/compose.production.yaml up --build -d
```

In PowerShell, set `$env:DOMAIN='home.example.com'` first, then run the Docker command. The explicit local trusted hosts allow the container health check to run. Do not add wildcard hosts.

5. Check `https://home.example.com/healthz`, create a real account, and inspect the browser's Secure cookie, HTTPS protocol, and Network lab. Confirm that requests to the server's public IP on port 8000 fail.

Do not expose the app directly with `TRUST_PROXY=true`. This setting trusts one hop for forwarded client address and scheme and is safe only with the private-port topology described above. The Compose network is single-host; it is not a cluster.

## Account recovery

Set `SMTP_HOST`, `SMTP_PORT`, `SMTP_FROM`, and optionally `SMTP_USER`/`SMTP_PASSWORD`. Port 587 with STARTTLS is the supported transport; implicit TLS on port 465 is not implemented. Recovery links use the configured `PUBLIC_ORIGIN`, never a client-provided Host header.

Test delivery with an account you control. The app deliberately returns a generic message if delivery fails; inspect the server's error logs and your mail provider. In-app household notifications work without SMTP.

## Data and backups

The named `ledger` volume contains the SQLite database. Keep `AUDIT_KEY` backed up separately; losing or changing it makes earlier chain verification fail. Rotating `SECRET_KEY` signs everyone out and is independent of the audit key.

Use SQLite's backup API while the app is running, not a plain copy of only the `.db` file while WAL is active:

```sh
# Source installations:
python scripts/backup.py instance/commonroom.db backups/commonroom-2026-09-26.db
```

The utility refuses to overwrite an existing destination and runs an integrity check on the snapshot. Encrypt and access-control backups. For container deployments, run the same SQLite backup operation inside the application container and copy the resulting snapshot to your backup store; the application image intentionally excludes operational scripts.

Restore only with the application stopped. Preserve the current volume first, restore a verified snapshot and its matching audit key, ensure the database is writable by the `commonroom` user, then start one application instance to run migrations. Verify `/healthz`, login, household balances, and the audit-chain status. A database backup does not include `.env` secrets unless you separately back them up.

## Operations

- Structured request logs contain method, route template, status, duration, and request ID. They omit passwords, cookies, JSON bodies, and token query strings. SSE duration is header-generation time, not connection lifetime.
- The database busy timeout is five seconds. A 503 can indicate write contention; investigate before increasing worker counts.
- The default server has 24 threads and a global limit of 16 SSE leases. Each account can hold two streams. Long-running requests and synchronous SMTP can still consume capacity; this is not a high-scale deployment.
- Runtime Python packages are pinned. Frontend packages are installed from a frozen lockfile. Container base images use maintained major-version tags and should be rebuilt regularly; pin digests in a deployment requiring fully immutable builds.
- Apply migrations through one startup process before increasing process count. Never share this SQLite database between hosts or put it on a network filesystem.
- Demo data is retained locally until you replace the development database/volume. Production refuses to start with demo mode enabled. Do not expose the local demo configuration as a public anonymous service.

## Validation limits

CI builds the Linux image and checks its health and frontend response. This is a container smoke test, not a test of your domain, certificate issuance, firewall, SMTP credentials, backup storage, or production workload. Validate those in the environment where you deploy.
