# Harness eval suite

Regression tests for **agent configuration** — not application unit tests.

## Harness evals vs app tests

| | Harness evals | App tests |
| --- | --- | --- |
| **Target** | `AGENTS.md`, constitution, skills, review prompts, MCP wiring | Production code behaviour |
| **Question** | Does the agent follow harness rules when prompted? | Does the feature meet acceptance criteria? |
| **When** | PR touches harness artifacts (see workflow paths) | Implementation PRs, CI on `src/` |
| **Failure meaning** | Harness regression — agent may ignore P6, skip spec, hard-code colours | Functional bug or broken contract |

Harness evals use **prompt + check** tasks: run a scenario prompt against an agent (or a mock result in CI), then assert on output text or edited files.

## Structural checks (blocking)

Deterministic assertions on harness artifacts — no agent required:

```bash
node .github/tier2-v3/evals/structural-checks.mjs --root .
```

Checks: constitution P1–P8, `REVIEW.md` receipt section, `AGENTS.md` no self-merge, feature scaffold / `@R-xx.y` convention, optional `spec/criteria-index.json`.

## Layout

```
evals/
  README.md
  structural-checks.mjs   # blocking CI structural tests
  manifest.json
  tasks/*.json
  check.mjs
  run-evals.mjs           # validate / --simulate (warn-only in CI)
```

## Agent task schema (simulate)

```json
{
  "id": "task-id",
  "prompt": "User message sent to the agent",
  "checks": [
    { "type": "output_contains", "value": "human" },
    { "type": "output_not_contains", "value": "#003366" },
    { "type": "file_contains", "value": "### P1 —", "file": "constitution.md" }
  ]
}
```

Check types:

- `output_contains` — agent response (case-insensitive) includes `value`
- `output_not_contains` — agent response must not include `value`
- `file_contains` — edited file content includes `value` (`file` optional; defaults to all files in result)

## Result file (for check.mjs)

Mock or captured agent run:

```json
{
  "output": "Agent natural-language response",
  "files": {
    "constitution.md": "# Constitution\n### P1 — Accessibility\n..."
  }
}
```

## Local usage

```bash
# Validate manifest + task JSON (dry-run)
node .github/tier2-v3/evals/run-evals.mjs

# CI / smoke: canned good + bad responses
node .github/tier2-v3/evals/run-evals.mjs --simulate

# Single task against a saved result
node .github/tier2-v3/evals/check.mjs \
  --task .github/tier2-v3/evals/tasks/refuse-merge-without-human.json \
  --result /tmp/result.json
```

## CI

Workflow **Tier 2 v3 / Harness evals** runs on PRs that change harness artifacts:

1. **Structural checks** — blocking (`structural-checks.mjs`)
2. **Simulate** — warn-only (`continue-on-error`); validates task JSON + check harness with canned responses

Real agent evals (gh-aw or Actions LLM) can replace `--simulate` when org policy allows live runs.
