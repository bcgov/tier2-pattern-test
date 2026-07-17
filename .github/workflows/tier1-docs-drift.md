---
name: Tier 1 / Docs drift (gh-aw)
on: weekly on monday

permissions:
  contents: read
  issues: read
  pull-requests: read
  copilot-requests: write

engine: copilot

tools:
  github:
    toolsets: [default]

safe-outputs:
  create-pull-request:
  create-issue:

---

# Tier 1 — Docs drift (agentic)

Compile with `gh aw compile`, then commit the generated `.lock.yml`.

Also triggerable after compile via the Actions UI if `workflow_dispatch` is added in a later frontmatter revision.

Compare recent changes under code paths (`src/`, `app/`, `lib/` if present) against documentation (`docs/`, `README.md`).

## Tasks

1. Identify code changes from the last 14 days that affect user-facing or public API behaviour.
2. Check whether `docs/` and `README.md` describe the current behaviour.
3. If docs are behind:
   - Prefer opening a **draft pull request** that updates the relevant docs (minimal, accurate edits) via safe-outputs.
   - If you cannot safely edit docs, open an issue summarizing what drifted and which files to update.
4. If docs are current, take **no write action** (do not open an empty PR).

## Constraints

- Do not change application source code except through the docs-focused pull request safe-output.
- Do not invent APIs not evidenced in the repository.
- Keep the PR description actionable for a human reviewer.
