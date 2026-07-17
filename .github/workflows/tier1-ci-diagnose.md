---
name: Tier 1 / CI diagnose (gh-aw)
on:
  workflow_run:
    workflows:
      - "Tier 1 / Demo fail CI"
      - "CI"
      - "Tests"
      - "Build"
      - "test"
    types: [completed]
    branches:
      - main

permissions:
  actions: read
  contents: read
  issues: read
  pull-requests: read
  copilot-requests: write

engine: copilot

tools:
  github:
    toolsets: [default]

safe-outputs:
  add-comment:
  create-issue:

---

# Tier 1 — CI diagnose (agentic)

Compile with `gh aw compile`, then commit the generated `.lock.yml`.

A watched GitHub Actions workflow has completed. Run **only if** the conclusion is **failure**.

## Tasks

1. Inspect the failed workflow run and failed job logs.
2. Produce a short diagnosis: likely root cause, evidence from the log, and 2–5 concrete next steps.
3. If there is an open pull request for the failing head SHA, comment on that PR via safe-outputs.
4. Otherwise open a GitHub issue titled `Tier 1: CI failed — <workflow name>` with the diagnosis.

## Constraints

- Ignore failures of Tier 1 meta workflows if they appear (preflight / triage / docs drift / this diagnose workflow).
- Do not push code fixes in this workflow (diagnosis only).
- Do not paste secrets from logs; redact tokens and passwords.
- Keep the write-up under ~400 words plus a short log excerpt if helpful.
