# Tier 2 — agent backends & coding agent

## What Tier 2 adds beyond Tier 1

| Capability | Mechanism |
| --- | --- |
| Spec as source of truth | `spec/` + constitution in git |
| Checkpoint gate | Actions workflow fails PRs missing artifacts |
| Spec-aware review | Actions heuristic (+ optional LLM) and/or `gh-aw` |
| Implementation | Label `ready-for-agent` → **auto-assign Copilot coding agent** |

## Coding agent workflow

### A. Local coding agent (recommended for day-to-day)

See **[LOCAL.md](LOCAL.md)** — open the enrolled repo, wire MCP from `.github/mcp/mcp.json.example`, follow `AGENTS.md`, implement, push a draft PR.

### B. Copilot cloud (GitHub)

1. Issue uses the Feature template (spec ref + acceptance).
2. Human adds label **`ready-for-agent`** (or Feature template includes it).
3. Workflow **Tier 2 v3 / Assign coding agent** assigns `copilot-swe-agent[bot]` via the Issues API (`agent_assignment`).
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

### Config (`tier2-v3.config.json`)

```json
"coding_agent": {
  "auto_assign": true,
  "assign_label": "ready-for-agent",
  "base_branch": "main",
  "custom_instructions": ""
}
```

Set `auto_assign: false` to keep the label as a human-only signal.

## Azure OpenAI (Actions LLM path)

Same secrets as Tier 1. Use when `spec_review.mode` / `agent.mode` is `auto` or `llm` (not `gh-aw`).

```bash
REPO=bcgov/tier2-pattern-test   # or kmandryk/tier2-pattern-test

# APIM subscription key (or native Azure key)
gh secret set TIER1_LLM_API_KEY --repo "$REPO"

# Full deployment URL (endpoint + /openai/deployments/{name})
gh secret set TIER1_LLM_BASE_URL --repo "$REPO" \
  --body "https://ai-services-hub-test-apim.azure-api.net/sdpr-invoice-automation/openai/deployments/gpt-5.1-chat"

gh variable set TIER1_LLM_API_STYLE --repo "$REPO" --body "azure-apim"
gh variable set TIER1_LLM_API_VERSION --repo "$REPO" --body "2025-04-01-preview"
```

In `tier2-v3.config.json` (and `tier1.config.json` if enrolled):

```json
"agent": {
  "mode": "auto",
  "llm": {
    "api_style": "azure-apim",
    "base_url": "https://ai-services-hub-test-apim.azure-api.net/sdpr-invoice-automation/openai/deployments/gpt-5.1-chat",
    "api_version": "2025-04-01-preview",
    "api_key_env": "TIER1_LLM_API_KEY"
  }
},
"spec_review": { "mode": "auto" }
```

If `spec_review.mode` is `gh-aw`, Azure/APIM is unused for review (Copilot CLI runs instead).

## MCP

See `.github/mcp/mcp.json.example`. Required for UI work: Design System MCP. Recommended: `bcgov-sdlc`, GitHub; Figma when design-in-the-loop.

## gh-aw

```bash
# After enrol --with-gh-aw
gh aw compile   # produces tier2-v3-spec-review.lock.yml
```

Set `spec_review.mode` / reuse Tier 1 `agent.mode` carefully — avoid double comments from Actions + gh-aw on the same PR (prefer one).

## Harness evals

Regression tests for **agent configuration**, not application unit tests. When a PR changes `AGENTS.md`, constitution, `.github/tier2-v3/**`, or `REVIEW.md`, workflow **Tier 2 v3 / Harness evals** runs.

| | Harness evals | App tests |
| --- | --- | --- |
| Target | Harness rules (merge refusal, spec-first, design tokens, P1–P8) | Feature behaviour in `src/` |
| Artifact | `evals/tasks/*.json` prompt + checks | Gherkin + repo test suite |
| CI today | `--simulate` with canned good/bad responses (warn-only) | Checkpoint gate + your CI |

Layout (after enrol): `.github/tier2-v3/evals/`. See `evals/README.md` in the pattern pack.

```bash
# Validate task JSON
node .github/tier2-v3/evals/run-evals.mjs

# CI smoke / local harness check
node .github/tier2-v3/evals/run-evals.mjs --simulate
```

Seed tasks: refuse merge without human (P6), require spec reference (P5), no hard-coded `#003366`, preserve constitution P1–P8 markers, query Design System MCP before UI (P2).

Future: replace `--simulate` with live agent runs (gh-aw or Actions LLM) and configurable pass-rate gates.
