# Tier 2 — agent backends & coding agent

## What Tier 2 adds beyond Tier 1

| Capability | Mechanism |
| --- | --- |
| Spec as source of truth | `spec/` + constitution in git |
| Checkpoint gate | Actions workflow fails PRs missing artifacts |
| Spec-aware review | Actions heuristic (+ optional LLM) and/or `gh-aw` |
| Implementation | **Copilot coding agent** (or IDE agent) on labeled issues — not Tier 1 triage |

## Coding agent (where the work happens)

1. Issue uses the Feature template (spec ref + acceptance).
2. Human (or intake) adds label `ready-for-agent`.
3. Assign **GitHub Copilot coding agent** to the issue (GitHub UI / `gh` / org process).
4. Agent opens a **draft PR**; Tier 2 workflows comment (spec review + checkpoint gate).
5. Human merges (checkpoint 3).

Tier 1 triage only labels issues — it does **not** implement.

## MCP

See `.github/mcp/mcp.json.example`. Required for UI work: Design System MCP. Recommended: `bcgov-sdlc`, GitHub; Figma when design-in-the-loop.

## gh-aw

```bash
# After enrol --with-gh-aw
gh aw compile   # produces tier2-spec-review.lock.yml
```

Set `spec_review.mode` / reuse Tier 1 `agent.mode` carefully — avoid double comments from Actions + gh-aw on the same PR (prefer one).
