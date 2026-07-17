# Tier 1 — GitHub Agentic Workflows (`gh-aw`) path

Natural-language agent workflows (public preview). These are **sources**; GitHub runs the compiled `*.lock.yml` files.

## Prerequisites

1. `gh` CLI authenticated with `repo,workflow` scopes  
2. Extension: `gh extension install github/gh-aw`  
3. Engine auth (pick one):
   - **Org Copilot billing:** `copilot-requests: write` in frontmatter (already set) + org policy allowing Copilot CLI billed to org  
   - **PAT secret:** `COPILOT_GITHUB_TOKEN` (or engine-specific secret per [GitHub docs](https://docs.github.com/en/copilot/how-tos/github-agentic-workflows/creating-github-agentic-workflows))

## Enable in a consumer repo

**Important:** `gh aw compile` only sees Markdown whose **first line** is `---`. You must be on a branch that actually contains `tier1-*.md` (usually `main` after enrol `--with-gh-aw`). An empty local `master` with only `.yml` files will fail with “no workflow markdown files found”.

The pack vendors **precompiled** `tier1-*.lock.yml` next to the sources (from a successful `gh aw compile`). Enrol copies them when present. **Re-compile** after you edit frontmatter.

```bash
# Sync to remote main if your local clone is empty/orphan:
git fetch origin && git checkout -B main origin/main

# From consumer repo root (after enrol --with-gh-aw, or copy manually)
cp /path/to/patterns/tier1/gh-aw/tier1-*.md /path/to/patterns/tier1/gh-aw/tier1-*.lock.yml .github/workflows/

# Set agent mode so plain Actions jobs skip (avoid double triage)
# In tier1.config.json:
#   "agent": { "mode": "gh-aw" }

gh aw init          # once per repo (optional but recommended)
gh aw compile       # generates *.lock.yml beside each .md
git add .github/workflows/tier1-*.md .github/workflows/tier1-*.lock.yml tier1.config.json
git commit -m "chore(tier1): enable gh-aw agentic workflows"
git push
```

Disable or rename the plain Actions workflows (`tier1-triage.yml`, etc.) if you prefer only lock.yml runners — or keep them with `agent.mode: "gh-aw"` so the Node scripts no-op.

## Maturity note

`gh-aw` is preview. Keep the heuristic/LLM Actions path as fallback (`agent.mode: "auto"` or `"heuristic"`). Markdown sources in this folder remain yours even if compile tooling changes.
