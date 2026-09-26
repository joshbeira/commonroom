# Changelog

## 1.0.0 — 2026-09-26

First public release of Commonroom.

- Responsive React/TypeScript household dashboard with locally bundled fonts and assets.
- Exact-penny equal and weighted expense allocation, validated receipts, CSV export, and payment confirmation.
- Revocable sessions, CSRF protection, household isolation, expiring invitations, and optional account recovery.
- Atomic idempotent expense creation and an HMAC-linked audit trail.
- Resumable live household events with connection quotas and session revalidation.
- Network diagnostics with measured browser/application timings and protocol explanations.
- Automated accounting, security, concurrency, browser, accessibility, dependency, and container checks.
- Local Docker configuration, HTTPS reverse-proxy configuration, backup utility, and operational documentation.

This release tracks externally made payments; it does not process transfers or connect to banks. See the documented capacity and security boundaries before deployment.
