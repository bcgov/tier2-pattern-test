# Operate Tier 1

Human playbook for **day-to-day use** of the Tier 1 pattern after enrol.  
For first-time setup see [ENROL.md](ENROL.md). For backends and secrets see [AGENTIC.md](AGENTIC.md).

**What Tier 1 is:** lightweight repo automation — issue triage, docs-drift nudges, and CI failure diagnosis. It does **not** implement features or run Spec Kit checkpoints (that’s Tier 2).

---

## Who does what

| Role | Responsibilities |
| --- | --- |
| **Repo maintainers** | Own `tier1.config.json`, Actions permissions, secrets, which CI workflows diagnose watches |
| **Developers** | Write usable issue bodies; respond to `needs-detail`; keep docs in sync with code when drift PRs open |
| **Platform / pattern owners** | Pack updates, enrol support, org policy (Actions, Copilot billing for gh-aw) |

---

## What runs (and when)

| Workflow | Trigger | What you should see |
| --- | --- | --- |
| **Issue triage** | Issue opened / edited | Labels (`bug`, `enhancement`, …) and a bot comment when the body is thin (`needs-detail`) |
| **Docs drift** | Schedule or manual (and/or pushes touching code paths) | Draft PR or issue when `src/` (etc.) changed without `docs/` / README |
| **CI diagnose** | Another workflow **fails** (via `workflow_run`) | Comment on the failed run / related issue with a short diagnosis |
| **Preflight** | Manual (`workflow_dispatch`) | Green check that scripts + config + labels look sane |
| **Demo fail CI** | Manual | Intentional failure so you can test CI diagnose |

Workflow files live under `.github/workflows/tier1-*.yml` (and optional `tier1-*.lock.yml` if using gh-aw).

---

## Normal weekly rhythm

1. **Monday (or after pack updates)** — Run **Tier 1 / Preflight**. Fix anything red before trusting triage.
2. **Issues** — Prefer problem / expected / actual / steps. Thin issues get `needs-detail`; that’s working as designed.
3. **Docs drift PRs** — Review like any draft PR: accept the doc update, adjust paths in config, or close with a reason if the change was intentional noise.
4. **Failed CI** — Read the diagnose comment first; it won’t always be right, but it should point at the failing job/log slice faster.
5. **Config tweaks** — Edit `tier1.config.json` on a branch; no re-enrol needed for path lists, labels rules, or enabling/disabling a capability.

---

## Config you’ll actually touch

Root file: **`tier1.config.json`**.

| Knob | Typical use |
| --- | --- |
| `project` | Display name in comments |
| `agent.mode` | `heuristic` (default-safe) · `auto` (LLM if secret present) · `llm` · `gh-aw` |
| `triage.enabled` / `docs_drift.enabled` / `ci_diagnose.enabled` | Soft off without deleting workflows |
| `triage.min_body_length` / `label_rules` | Tune how strict / how labels map |
| `triage.promote_intent` / `intent_ready_label` | When Tier 2 v2 enrolled — auto-label well-formed issues for intent PR |
| `docs_drift.doc_paths` / `code_paths` | Match *your* tree (`apps/` vs `src/`) |
| `ci_diagnose.ignore_workflows` | Don’t diagnose Tier 1 itself; add other noisy workflows by **exact** `name:` |

Details and Azure/APIM shapes: [AGENTIC.md](AGENTIC.md).

### Switching agent backends (stay on one)

| Goal | Steps |
| --- | --- |
| Stay on keywords only | `agent.mode`: `heuristic` — no LLM secret needed |
| Richer comments via Actions LLM | Set secret `TIER1_LLM_API_KEY` (+ optional URL/style vars); `agent.mode`: `auto` or `llm` |
| Copilot CLI via gh-aw | Enrol/copy gh-aw sources, `gh aw compile`, commit locks, `agent.mode`: `gh-aw` |

**Rule:** pick **one** writer per event. If both Actions LLM jobs and gh-aw lock workflows comment on the same issues/PRs, you’ll get double noise. Prefer a single mode in config and align the files you keep enabled with that choice.

---

## Soft-disable a capability

Set the matching `*.enabled` flag to `false` in `tier1.config.json` and push. Workflows may still appear in the Actions tab; jobs should no-op or skip meaningful work. Use this for a noisy docs-drift path or a temporary CI diagnose pause.

---

## First-week checklist (after enrol)

- [ ] Actions: workflow permissions **Read and write**
- [ ] **Preflight** green
- [ ] Open a thin test issue → expect `needs-detail` (+ labels)
- [ ] Run **Demo fail CI** → expect **CI diagnose** to react
- [ ] Touch only `src/` (or your `code_paths`) → run **Docs drift** → expect draft PR or issue
- [ ] Point CI diagnose at your **real** CI workflow `name:` (edit the diagnose workflow’s `workflow_run.workflows` list)

---

## Troubleshooting

| Symptom | Likely cause | What to try |
| --- | --- | --- |
| Workflows never run | Actions disabled / org policy | Settings → Actions; check org allowlists |
| Triage can’t label | `GITHUB_TOKEN` read-only | Workflow permissions → Read and write |
| CI diagnose silent | Wrong workflow **name** in `on.workflow_run` | Copy the exact `name:` from the failing workflow YAML |
| Docs drift always / never | `code_paths` / `doc_paths` don’t match repo layout | Edit config; re-run docs drift |
| LLM path falls back to heuristic | Missing/wrong `TIER1_LLM_API_KEY` or APIM network block | Check secrets/vars; see wiki status on APIM |
| Duplicate comments | Actions + gh-aw both active | One mode only — see AGENTIC.md |
| Preflight wants labels | Labels not created yet | Let preflight/`ensureLabel` create them, or apply `.github/tier1/labels.yml` |

Live org blockers (APIM, Copilot billing): see the pattern monorepo wiki page `wiki/synthesis/bcgov-pattern-packs.md` (or ask platform).

---

## Updating the pack

From the pattern source repo:

```bash
./patterns/tier1/enrol.sh /path/to/your-service [--with-gh-aw]
```

Re-enrol **overwrites** workflows and scripts but **keeps** an existing `tier1.config.json`. Re-read the diff before push. After gh-aw source edits: `gh aw compile` and commit new locks.

---

## Related docs

| Doc | Use when |
| --- | --- |
| [ENROL.md](ENROL.md) | First install |
| [YOU-PROVIDE.md](YOU-PROVIDE.md) | Prerequisites checklist (pattern source; may not be copied) |
| [AGENTIC.md](AGENTIC.md) | Modes, secrets, Azure/APIM, gh-aw |
| Tier 2 operate | Spec-driven delivery — `.github/tier2/OPERATE.md` if enrolled with Tier 2 |
