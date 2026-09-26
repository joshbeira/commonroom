# Contributing

Use the setup instructions in [README.md](README.md), create a branch, and keep changes focused. Before opening a pull request:

1. Run the Python tests and Ruff checks.
2. Build the TypeScript client and check formatting.
3. Run browser tests if a user journey changed.
4. Add a regression test for financial, authorization, or state-transition changes.
5. Update API and operational documentation when behavior changes.

## Invariants worth protecting

- Monetary input is integer pennies. Do not use floats in allocation or storage.
- Every protected resource must be checked against the authenticated household.
- An expense mutation and its audit event belong in one transaction.
- Retry behavior must not create duplicate financial records.
- Never weaken a test or bypass a dependency advisory to make CI pass; fix the underlying issue or document an evidence-based exception in the PR.
- Do not commit databases, cookies, SMTP credentials, receipt data, or environment files.

The demo uses invented names and data. Browser tests run with a fresh temporary database. Do not run tests against a household containing real data.

## Formatting

Python uses Ruff. TypeScript, TSX, CSS, and frontend configuration use Prettier. Prefer comments that explain invariants and tradeoffs over comments that narrate syntax.

## Changes to the schema

Add the next numbered migration in `server/migrations/`, preserving existing migration files. Exercise migration from an existing database, and update backup/restore instructions if necessary. This project does not support automatic destructive migrations or downgrade migrations.
