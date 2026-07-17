# Tier 2 — agent backends & coding agent

## What Tier 2 adds beyond Tier 1

| Capability | Mechanism |
| --- | --- |
| Spec as source of truth | `spec/` + constitution in git |
| Checkpoint gate | Actions workflow fails PRs missing artifacts |
| Spec-aware review | Actions heuristic (+ optional LLM) and/or `gh-aw` |
| Implementation | Label `ready-for-agent` → **auto-assign Copilot coding agent** |

## Coding agent workflow

1. Issue uses the Feature template (spec ref + acceptance).
2. Human adds label **`ready-for-agent`** (or Feature template includes it).
3. Workflow **Tier 2 / Assign coding agent** assigns `copilot-swe-agent[bot]` via the Issues API (`agent_assignment`).
4. Copilot opens a **draft PR**; checkpoint gate + spec review run.
5. Human merges (checkpoint 3).

Tier 1 triage only labels issues — it does **not** implement.

### Secret (required for auto-assign)

Actions `GITHUB_TOKEN` **cannot** assign Copilot (billing is tied to a user). Set:

```bash
# Fine-grained PAT: Issues RW, Contents RW, Pull requests RW, Metadata R
# Classic: repo scope
gh secret set COPILOT_ASSIGN_TOKEN --repo OWNER/REPO
```

Optional fallback: `COPILOT_GITHUB_TOKEN` (same user-token rules).

Also required: **Copilot coding agent enabled** for the repo and token owner  
(Settings → Copilot → Coding agent / org policy). If GraphQL `suggestedActors` does not list `copilot-swe-agent`, assignment will fail until that is turned on.

### Config (`tier2.config.json`)

```json
"coding_agent": {
  "auto_assign": true,
  "assign_label": "ready-for-agent",
  "base_branch": "main",
  "custom_instructions": ""
}
```

Set `auto_assign: false` to keep the label as a human-only signal.

## MCP

See `.github/mcp/mcp.json.example`. Required for UI work: Design System MCP. Recommended: `bcgov-sdlc`, GitHub; Figma when design-in-the-loop.

## gh-aw

```bash
# After enrol --with-gh-aw
gh aw compile   # produces tier2-spec-review.lock.yml
```

Set `spec_review.mode` / reuse Tier 1 `agent.mode` carefully — avoid double comments from Actions + gh-aw on the same PR (prefer one).
