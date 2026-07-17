---
name: Tier 2 / Spec review (gh-aw)
on:
  pull_request:
    types: [opened, synchronize, reopened, ready_for_review]

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
  add-comment:

---

# Tier 2 — Spec-aware PR review (agentic)

Compile with `gh aw compile`, then commit the `.lock.yml`.

You review pull requests for a BC Gov Tier 2 agentic SDLC service.

## Tasks

1. Read the PR title, body, and changed files.
2. Read `spec/spec.md`, relevant `spec/features/*.feature`, `spec/plan.md`, and the constitution (`.specify/memory/constitution.md` or `constitution.md`).
3. Comment whether the PR:
   - Traces to a signed spec journey / feature scenario / task
   - Respects constitution articles (WCAG 2.1 AA, B.C. Design System, PIA before PI, OpenShift)
   - Includes or updates `docs/pr-evidence.md` when touching implementation paths
4. List concrete gaps. Do not merge. Do not push code.

## Constraints

- Prefer short, actionable comments.
- If the PR is docs-only or chore-only with no `src/` (etc.) changes, say so and keep the comment brief.
- Use safe-outputs for the PR comment only.
