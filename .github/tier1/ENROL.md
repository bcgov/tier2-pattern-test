# Enrol Tier 1 (external teams)

**Goal:** an afternoon to get issue triage, docs drift, and CI diagnosis in *your* repo.

## Prerequisites

See **[YOU-PROVIDE.md](YOU-PROVIDE.md)** — GitHub access, Actions enabled, and (for a test) a disposable repo.

## 5-minute enrol

From a clone of this pattern repo (or `ai-sdlc`):

```bash
# Create / clone your consumer repo first, then:
chmod +x patterns/tier1/enrol.sh
./patterns/tier1/enrol.sh /path/to/your-test-repo

cd /path/to/your-test-repo
# Edit project name + paths
${EDITOR:-nano} tier1.config.json

git add .
git commit -m "chore: enrol Tier 1 automation"
git push -u origin HEAD
```

Or start from the scaffold:

```bash
cp -R patterns/tier1-example /path/to/tier1-test
cd /path/to/tier1-test
# enrol already applied; still safe to re-run:
../tier1/enrol.sh .
```

## After push

1. **GitHub → Settings → Actions → General** — allow Actions; allow read/write for workflows if asked (`GITHUB_TOKEN` workflow permissions → Read and write).
2. **Actions** tab → run **Tier 1 / Preflight** (workflow_dispatch). Must be green.
3. Edit **Tier 1 / CI diagnose** workflow: under `on.workflow_run.workflows`, add the exact `name:` string of your real CI workflow (demo fail is already listed).

## Try each workflow

| Workflow | How to test |
| --- | --- |
| Issue triage | Open an issue titled `bug: something broken` with a 1-line body → expect `bug` + `needs-detail` + bot comment |
| CI diagnose | Actions → **Tier 1 / Demo fail CI** → Run → wait for **Tier 1 / CI diagnose** to open an issue/PR comment |
| Docs drift | Commit a change only under `src/` with no doc update → Actions → **Tier 1 / Docs drift** → Run → expect draft PR or issue |

## Config

`tier1.config.json` at repo root (see `tier1.config.example.json`).

### Agent backends (where the agent is)

See **[AGENTIC.md](AGENTIC.md)**.

| Mode | Enrol | Secrets |
| --- | --- | --- |
| `heuristic` / `auto` without key | default | none |
| `auto` / `llm` | set secret `TIER1_LLM_API_KEY` | OpenAI-compatible (or Azure) |
| `gh-aw` | `./enrol.sh REPO --with-gh-aw` then `gh aw compile` | Copilot org billing or `COPILOT_GITHUB_TOKEN` |

```bash
# LLM path
gh secret set TIER1_LLM_API_KEY --body "$OPENAI_API_KEY" --repo YOU/YOUR-REPO
# optional: gh secret set TIER1_LLM_BASE_URL --body "https://your-gateway/v1"

# gh-aw path
./enrol.sh /path/to/repo --with-gh-aw
cd /path/to/repo
# set agent.mode to "gh-aw" in tier1.config.json
gh extension install github/gh-aw
gh aw compile
git add .github/workflows/tier1-*.md .github/workflows/tier1-*.lock.yml tier1.config.json
git commit -m "chore(tier1): gh-aw agents" && git push
```

## Day-to-day

After enrol, use **[OPERATE.md](OPERATE.md)** — roles, weekly rhythm, config knobs, troubleshooting.

## Support

If preflight fails, paste the job log into an issue on the pattern repo. Do not disable workflows to greenwash CI.
