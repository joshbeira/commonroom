# Security policy

## Reporting

Please report suspected vulnerabilities through [GitHub private vulnerability reporting](https://github.com/joshbeira/commonroom/security/advisories/new). Include a minimal reproduction, affected version, and impact. Do not post credentials, personal household data, or an exploit against a live third-party instance in a public issue.

## Threat model

The application protects household records from unauthenticated users, malicious members of other households, cross-site mutation requests, and accidental or concurrent duplicate writes. Household members are authorized to see their household's expenses, receipts, members, and audit events.

The household owner can issue expiring invitations. An expense creator can confirm a submitted payment and archive a fully settled expense. A participant can mark only their own share as submitted. No platform-wide administrator or default privileged account exists.

### Implemented controls

- Scrypt password hashing through Werkzeug; passwords are 12–128 characters and are never logged.
- Signed HttpOnly, SameSite=Lax cookies containing random session identifiers and CSRF state. Database session identifiers are SHA-256 hashes and expire after 12 hours. Login rotates identifiers and CSRF; logout and password reset revoke database sessions.
- CSRF token checks on every unsafe API request, including authentication. Cross-site Fetch Metadata requests are rejected. There is no permissive CORS configuration.
- Explicit household scoping for expense reads, receipts, payment actions, exports, and event streams. Cross-household resource IDs return 404.
- Parameterized SQL and application/SQL validation. All monetary values are bounded integer pennies; boolean and floating-point values are rejected.
- Content Security Policy without inline scripts, frame protection, MIME sniffing protection, no-referrer policy, production HSTS, and Secure cookies. Inline styles remain permitted for computed chart sizes; this is an explicit CSP compromise.
- SQLite-backed fixed-window rate limits shared by processes on the same database. Forwarded IPs are ignored unless `TRUST_PROXY=true` explicitly enables trust in one proxy.
- Decoded JPEG/PNG receipts only; 5 MB request and output limits, 16-megapixel limit, 2200-pixel thumbnail bound, metadata stripping, and authenticated serving. Existing evidence cannot be overwritten. Re-encoding reduces risk; it is not antivirus scanning.
- Formula-prefix neutralization in CSV export.
- Separate HMAC audit key. Each entry incorporates the prior hash and canonical event content, and is appended inside the same transaction as the domain change.
- Live streams recheck session/membership every batch; 25-second lifetime, 2-second heartbeats, at most two concurrent streams per account and sixteen overall. Leases expire after 60 seconds if a worker dies.
- Optional password recovery with hashed, single-use, 30-minute tokens, session revocation, fixed configured origin, and SMTP STARTTLS. Recovery responses do not explicitly disclose account existence.

## Residual risks and operational boundaries

- This is a personal project, not a security certification or independent penetration test.
- A compromised application process or stolen audit key can forge records. Chain verification detects changes to event rows, not arbitrary tampering with all domain tables. Without externally retained chain heads it cannot detect deletion of the most recent events or an entire history. Back up the database and key separately; store a chain head externally if this matters to your deployment.
- No MFA, email-verification gate, or external abuse-protection service is implemented. Registration can disclose an existing address through a conflict response; recovery timing can also differ because email is sent synchronously. Account discovery is not considered fully mitigated.
- Rate limits use the IP seen by the server; users sharing a NAT share a limit. Application quotas do not replace ingress-level denial-of-service protection.
- SQLite files and backups are not encrypted by the app. Use encrypted disks, access-controlled backups, and appropriate retention.
- Uploaded images are retained in the ledger database. Do not upload unnecessary sensitive information. There is no automatic retention/deletion policy.
- HTTP is supported only for loopback development. Use the documented HTTPS deployment before storing real household information on an internet-facing instance.
- Notifications are in-app live events. SMTP is used for recovery, not automated payment reminders. Confirmation records a user's assertion; Commonroom cannot prove a bank transfer.

## Dependency maintenance

Runtime Python dependencies and frontend dependencies are pinned by `requirements.txt` and `web/pnpm-lock.yaml`. CI runs dependency audits, and Dependabot proposes updates. Audit results describe known advisories at scan time, not a guarantee that dependencies are vulnerability-free.
