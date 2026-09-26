# HTTP API

The React client and JSON API share one origin. Amounts are integer GBP pennies. Error responses use `{ "error": "message", "request_id": "..." }` for HTTP errors, with ordinary HTTP status codes. Database contention returns 503 with a generic retry message. Every response carries an `X-Request-ID` and application `Server-Timing`.

## Session bootstrap

`GET /api/session` returns a CSRF token, the current user or `null`, and demo/recovery availability. Include the returned token as `X-CSRF-Token` on every POST, including registration and login. Cookies are sent with same-origin requests. Authentication rotates the CSRF token; use the new value in the successful authentication response.

## Routes

| Method | Path | Access / behavior |
| --- | --- | --- |
| GET | `/healthz` | Public process/database readiness probe |
| GET | `/api/session` | Session and CSRF bootstrap |
| POST | `/api/auth/register` | `{name,email,password}`; password length 12–128 |
| POST | `/api/auth/login` | `{email,password}`; rate limited |
| POST | `/api/auth/logout` | Authenticated; revokes current database session |
| POST | `/api/auth/demo` | Explicit development mode only; isolated synthetic household |
| POST | `/api/auth/recover` | `{email}`; configured SMTP required; generic response |
| POST | `/api/auth/reset` | `{token,password}`; single use, revokes every user session |
| POST | `/api/household` | `{name}`; user must not already have a household |
| POST | `/api/household/invite` | Real household owner; returns code with 24-hour expiry |
| POST | `/api/household/join` | `{code}`; user must not already have a household |
| GET | `/api/workspace` | Household, members, ledger, net balances, suggestions, events, audit verification |
| POST | `/api/expenses` | Authenticated household member; idempotency key required |
| POST | `/api/expenses/:id/shares/:userId` | `{action: "submit" \| "confirm" \| "reject"}`; actor-specific state machine |
| POST | `/api/expenses/:id/archive` | Creator; every share must be confirmed |
| POST | `/api/expenses/:id/receipt` | Creator; multipart field `receipt`, validated JPEG/PNG |
| GET | `/api/expenses/:id/receipt` | Household member; re-encoded PNG |
| GET | `/api/export` | Household expense CSV; formula prefixes neutralized |
| GET | `/api/network/ping` | Authenticated; time, request ID, scheme, application-hop protocol |
| GET | `/api/events` | Authenticated household; SSE with `after` query or `Last-Event-ID` header |

## Create an expense

```http
POST /api/expenses
Content-Type: application/json
X-CSRF-Token: <session csrf>
Idempotency-Key: 5d40fd70-808d-487e-a123-73b14eab5261

{
  "title": "Sunday dinner",
  "category": "Groceries",
  "amount": 1001,
  "incurred_on": "2026-01-02",
  "note": "Dinner for the house",
  "weights": { "1": 1, "2": 1, "3": 1, "4": 1 }
}
```

Participant IDs must belong to the current household. Allowed categories: `Home`, `Groceries`, `Utilities`, `Transport`, `Other`. Weights are integers from 1 to 100. Expenses cannot be future-dated. The authenticated user is the original payer; a client cannot attribute a bill to someone else.

The first success returns `201 {"id": 42}`. A retry with the same user/key/payload returns `200 {"id": 42}`. Reusing the key with different content returns 409. An authorization or validation failure creates neither the expense nor an audit event.

## Common errors

| Status | Meaning |
| --- | --- |
| 400 | Invalid fields, malformed JSON, invalid image, untrusted host |
| 401 | Missing or expired authenticated session |
| 403 | Missing/incorrect CSRF, cross-site mutation, or insufficient role |
| 404 | Resource absent or outside the household |
| 409 | State conflict, duplicate account details, or idempotency mismatch |
| 413 | Request exceeds the 5 MB limit |
| 429 | Rate or stream limit; inspect `Retry-After` |
| 503 | Recovery unconfigured or database busy |

The API has no pagination for the household ledger, no multi-currency conversion, and no API-token authentication. It is currently designed for browser clients and modest household histories.
