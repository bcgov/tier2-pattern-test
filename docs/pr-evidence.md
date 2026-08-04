# PR Evidence

## Issue
Closes #7 — feature: add GET /echo that returns the query message

## Changes
- `src/index.js`: Implemented Express service with `GET /echo` route. Returns `{"message":"<value>"}` on 200, or `{"error":"..."}` on 400 when `message` param is absent.
- `src/index.test.js`: Jest + supertest tests covering the 200 and 400 cases.
- `package.json`: Initialized Node project with `express`, `jest`, and `supertest`.

## Acceptance criteria
- [x] `GET /echo?message=hello` → 200 `{"message":"hello"}`
- [x] `GET /echo` (no param) → 400 `{"error":"..."}`

## Test results
All 2 tests pass (`npm test`).
