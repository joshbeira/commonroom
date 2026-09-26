# Explaining Commonroom

## Project summary

Commonroom is a full-stack shared-expense platform built with React, TypeScript, Flask, and SQLite. It combines deterministic monetary allocation, a two-step payment workflow, household access controls, an HMAC-linked audit history, and resumable live updates. A browser diagnostics view makes the HTTP transport and timing behavior observable.

## CV wording

**Commonroom — Full-stack shared-expense platform** | React, TypeScript, Python, Flask, SQLite, Docker

- Built a responsive household expense platform with weighted integer-penny allocation, receipt validation, payment confirmation, and CSV export.
- Implemented revocable sessions, CSRF protection, household-scoped authorization, rate limits, transactional idempotency, and an HMAC-linked audit trail.
- Designed resumable server-sent events and a network diagnostics interface using browser Resource Timing, Server-Timing, and request correlation; added automated security, concurrency, browser, and accessibility checks in GitHub Actions.

Use these bullets after you have reviewed the implementation and can explain the decisions yourself. Do not add claims about users, revenue, production scale, measured latency improvements, security certification, or deployment uptime without evidence.

## A five-minute walkthrough

1. Open the demo. Explain the household's balances and how every sample workspace is isolated.
2. Add a £10.01 expense split four ways. Show the one-penny remainder and explain deterministic allocation.
3. Review a submitted payment. Explain why only the original payer can confirm receipt and why confirmation is distinct from moving money.
4. Open Activity. Show the verified chain and explain what it can and cannot detect.
5. Open Network lab. Compare the browser protocol and application hop, explain cached connections, and distinguish the measured timing from the conceptual TCP handshake.
6. Show the concurrent-retry test and CI workflow. Discuss the SQLite/SSE scaling boundaries rather than claiming untested capacity.

## Useful tradeoffs to understand

- Why use integer pennies instead of floating-point values?
- What happens if two identical expense requests arrive simultaneously?
- Why choose SSE over WebSockets for this application?
- Why can the browser use HTTP/2 or HTTP/3 while Flask sees HTTP/1.1?
- What would change when moving from one host to several?
- Why does an HMAC chain not by itself prove that the last event was not deleted?
- Why must forwarded-header trust match the actual proxy topology?
- How would you implement refunds, partial payments, and event retention without breaking the ledger's invariants?
