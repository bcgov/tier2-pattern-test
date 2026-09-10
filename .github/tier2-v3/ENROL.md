# Enrol Tier 2 v3 (external teams)

**Goal:** Spec Kit + constitution + checkpoint gate + spec-aware review in *your* service repo. Prefer enrolling **with Tier 1** so triage / docs drift / CI diagnose stay available.

## Prerequisites

See **[YOU-PROVIDE.md](YOU-PROVIDE.md)**.

## Enrol

```bash
chmod +x patterns/tier2-v3/enrol.sh
# Recommended: Tier 1 + Tier 2 + optional gh-aw sources
./patterns/tier2-v3/enrol.sh /path/to/your-service --with-tier1 --with-gh-aw

cd /path/to/your-service
${EDITOR:-nano} tier2-v3.config.json   # project name
${EDITOR:-nano} tier1.config.json   # if --with-tier1
${EDITOR:-nano} constitution.md     # fill {{PLACEHOLDER}}s (or .specify/memory/constitution.md)

git add .
git commit -m "chore: enrol Tier 2 (Spec Kit + checkpoints)"
git push -u origin HEAD
```

Scaffold already enrolled:

```bash
cp -R patterns/tier2-example /path/to/tier2-test
cd /path/to/tier2-test
# safe to re-run:
../tier2/enrol.sh . --with-tier1
```

## After push

1. **Actions** — Read and write workflow permissions (same as Tier 1).
2. Run **Tier 2 v3 / Preflight** (workflow_dispatch). Must be green.
3. Connect MCP for a local coding agent (see **[LOCAL.md](LOCAL.md)** — start from `.github/mcp/mcp.json.example`).
4. Open a **constitution PR** for architecture review; fill placeholders before production.
5. Write technology-free `spec/spec.md` + `spec/features/*.feature` → **checkpoint 1**.
6. Write `spec/plan.md` → **checkpoint 2**.
7. Set secret **`COPILOT_ASSIGN_TOKEN`** (user PAT — see [AGENTIC.md](AGENTIC.md)). Ensure Copilot coding agent is enabled on the repo.
8. Label issues `ready-for-agent` → workflow auto-assigns Copilot (or implement in IDE).
9. Draft PRs get checkpoint-gate + spec-review; **human merges** (checkpoint 3).

## Config

`tier2-v3.config.json` (see `tier2-v3.config.example.json`):

| Key | Purpose |
| --- | --- |
| `checkpoints.*` | What the gate requires |
| `spec_review.mode` | `heuristic` / `auto` / `llm` / `gh-aw` |
| `coding_agent.auto_assign` | Label → assign Copilot (`true` by default) |
| `coding_agent.assign_label` | Default `ready-for-agent` |
| `include_tier1` | Document intent; enrol with `--with-tier1` |

### Agent backends

See **[AGENTIC.md](AGENTIC.md)**.

| Mode | Enrol | Secrets |
| --- | --- | --- |
| Heuristic / `auto` without key | default | none |
| `auto` / `llm` | optional | `TIER1_LLM_API_KEY` (same as Tier 1) |
| `gh-aw` | `--with-gh-aw` + `gh aw compile` | Copilot org billing or `COPILOT_GITHUB_TOKEN` |

When `spec_review.mode` (or `agent.mode`) is `gh-aw`, the plain Actions **Spec review** job no-ops so you do not double-comment.

```bash
./enrol.sh /path/to/repo --with-tier1 --with-gh-aw
cd /path/to/repo
# set "spec_review": { "mode": "gh-aw" }  (and Tier 1 agent.mode if desired)
gh extension install github/gh-aw
gh aw compile
git add .github/workflows/tier2-*.md .github/workflows/tier2-*.lock.yml tier2-v3.config.json
git commit -m "chore(tier2): gh-aw spec review" && git push
```

## What “done” looks like for a story

1. Spec + feature signed (checkpoint 1)  
2. Plan approved (checkpoint 2)  
3. Coding agent (or human) opens draft PR  
4. Checkpoint gate + spec review green/commented  
5. Human merges (checkpoint 3)

## Day-to-day

After enrol, use **[OPERATE.md](OPERATE.md)** — checkpoints, local vs cloud implement, weekly rhythm, troubleshooting. Local agents: **[LOCAL.md](LOCAL.md)**.

## Support

Paste preflight / gate logs into an issue on the pattern repo. Do not disable the checkpoint gate to greenwash merges.
