# Operate Tier 2 v3

Human playbook for **day-to-day use** of the Tier 2 v3 pattern after enrol.  
For first-time setup see [ENROL.md](ENROL.md). Backends & coding agent: [AGENTIC.md](AGENTIC.md). Local IDE agents: [LOCAL.md](LOCAL.md).

**What Tier 2 v3 is:** spec-driven delivery — constitution + Spec Kit in git, human checkpoints, PR gates, optional Copilot assign, optional MCP for local agents.  
**What it is not:** a replacement for Tier 1 intake automation. Prefer running **with Tier 1** (`enrol --with-tier1`).

---

## Who does what

| Role | Responsibilities |
| --- | --- |
| **Product / tech lead** | Owns constitution placeholders → real standards; signs checkpoint 1–2; merges (checkpoint 3) |
| **Developers** | Write `spec/` and features; implement from signed work; draft PRs only until gate is green |
| **Local coding agent users** | Follow `AGENTS.md` + MCP; never self-merge |
| **Repo maintainers** | `tier2-v3.config.json`, secrets (`COPILOT_ASSIGN_TOKEN`, LLM), branch protection, MCP paths |
| **Platform** | Pack updates, org Copilot coding-agent policy, APIM/runner access for Actions LLM |

---

## The story of a change

```text
Constitution (living standards)
        ↓
Intent (intent/*.md) — stage 1: who is stuck, what outcome, constraints
        ↓
Spec + features  ──►  Checkpoint 1 (human: did we agree what to build?)
        ↓
Plan             ──►  Checkpoint 2 (human: is the plan sound?)
        ↓
Implement (local agent or Copilot cloud) ──► draft PR
        ↓
Checkpoint gate + spec review (CI)
        ↓
Human merge      ──►  Checkpoint 3 (does the PR match what we said?)
```

Agents may draft; **humans** accept intent, plan, and ship.

### Front door (no side entrances)

Every change — including production fixes and maintain-loop intents — re-enters through the same path: **intent → spec → plan → implement → merge**. There is no hot-patch lane that skips the record. Agents may **propose** (draft PRs, spec deltas, evidence); only a named human at a checkpoint **commits** the contract.

| Stage | Agent may | Human must |
| --- | --- | --- |
| Intent / evidence | Draft `intent/*.md`, suggest `## Evidence` | Accept problem and outcome (checkpoint 0 / promote PR) |
| Spec / features | Draft `spec/spec.md`, Gherkin with `@R-xx.y` | Sign checkpoint 1 — agree what to build |
| Plan | Draft `spec/plan.md` | Sign checkpoint 2 — agree how |
| Implement | Draft code + tests with provenance headers | Sign checkpoint 3 — merge |

**Proposal vs spec:** conversational intake and issue bodies are *proposals*. `spec/spec.md` and `spec/features/*.feature` are the *contract* after checkpoint 1. Do not treat chat or issue text as authoritative once spec is signed.

### Gate proliferation rule

Add a new automated gate only when (a) it blocks a class of defect humans repeatedly miss, and (b) it does not duplicate an existing check. Prefer extending `REVIEW.md`, criterion IDs, or metrics over new workflows. If a gate fires more than twice a month on false positives, tune or remove it — safety routed around provides no safety.

---

## Intent promotion (issue → intent PR)

Program staff file issues using the **Feature / story** template (Problem + Outcome required). When the issue is ready for stage-1 intent review:

1. **Automatic (with Tier 1):** set `triage.promote_intent: true` in `tier1.config.json`. Tier 1 triage adds label **`intent-ready`** when the body has Problem and Outcome and is not flagged `needs-detail`.
2. **Manual:** add label **`intent-ready`** on any well-formed issue.

The **Tier 2 v3 / Promote intent** workflow runs on that label and opens a **draft PR** on branch `intent/issue-{n}` with `intent/{slug}.md` rendered from `intent/.template.md`. Product owners review the intent artifact before spec work (checkpoint 1).

Dry-run locally (no branch/PR):

```bash
node .github/tier2-v3/scripts/promote-intent.mjs --issue 42 --dry-run
```

Offline render without `gh`:

```bash
node .github/tier2-v3/scripts/promote-intent.mjs --dry-run \
  --title "feature: my slice" \
  --body "$(cat issue-body.md)" \
  --author program-staff
```

---

## Artifacts you keep current

| Path | Role |
| --- | --- |
| `constitution.md` (and/or `.specify/memory/constitution.md`) | Non-negotiables: security, a11y, logging, stack |
| `spec/spec.md` | Technology-light “what” |
| `spec/features/*.feature` | Acceptance scenarios |
| `spec/plan.md` | Approach for the slice |
| `spec/tasks.md` | Implementable breakdown |
| `docs/pr-evidence.md` | Evidence pack for reviews (when required) |
| `AGENTS.md` | Entryfile for coding agents |
| `tier2-v3.config.json` | Gates, review mode, coding-agent assign |

Fill `{{PLACEHOLDER}}`s before treating the repo as production-ready.

---

## Human checkpoints (operate these deliberately)

| # | When | Owner asks | Exit |
| --- | --- | --- | --- |
| **1 — Spec** | Before implementation of a slice | Is the behaviour clear and testable? | Spec + features agreed (PR or recorded review) |
| **2 — Plan** | Before coding the slice | Is the approach safe and sized? | `spec/plan.md` agreed |
| **3 — Ship** | Before merge to the default branch | Does this PR match spec/plan and clear gates? | Human merge only |

Do not turn off the checkpoint gate to “make CI green.” Fix the artifacts or the PR scope.

### Assessment gap accepted (checkpoint 1)

When the signed spec asks for **less** than the originating finding / assessment **Expected**:

1. Add an explicit note under the feature file or `spec/spec.md`:  
   `Assessment gap accepted: <what was deferred> — follow-up: <issue or “none”>.`
2. Keep the backlog row **partial** (or open a follow-up issue) — do **not** mark the original finding fully done.
3. Prefer **scenario-per-outcome** Gherkin (one `@R-xx.y` scenario per concrete acceptance check). Avoid a single scenario that only says “the criterion is satisfied.”

Scope reduction is sometimes correct (e.g. server-side log shipping is a project). The failure mode is quietly closing the assessment finding when only the narrowed slice shipped.

### Evidence-only implementations (blocked)

The checkpoint gate **fails** implementation-shaped PRs that update `docs/pr-evidence.md` but touch **no** `impl_path_prefixes` (including `.github/workflows/`). Evidence without a code/workflow diff is not a fix (see agentic-b LOG-002).

Always append evidence:

```bash
node .github/tier2-v3/packs/pr-evidence/generate.mjs --root . --finding AUTH-001 --title "…" --append
```

### Direct vs pipeline mode (risk-tiered ceremony)

Not every change needs the full spec → plan → features apparatus. The **checkpoint gate** runs `triage-change.mjs` on PR changed files and chooses:

| Mode | When | Gate behaviour |
| --- | --- | --- |
| **Direct** (`tier2-v3:direct`) | ≤3 files, only under `allowed_prefixes`, low reference count, additive (no deletions) | `plan_present` and `features_present` are **WARN**, not FAIL |
| **Pipeline** (`tier2-v3:pipeline`) | Default when uncertain; any `@tier:high` criterion in features | Full ceremony — plan and features required when impl paths exist |

**`@tier:high`:** tag a scenario in Gherkin when the criterion needs full pipeline (security, PII, cross-cutting). Triage forces pipeline only when the PR **changes** that feature file or references that criterion — not for unrelated small edits.

**Criterion IDs (`@R-xx.y`):** every scenario should carry a permanent ID (e.g. `@R-14.1`). The checkpoint gate **warns** when IDs are missing. IDs feed weekly `coverageStates` in the metrics artifact.

**Conservative by design:** a false negative (small job sent through full pipeline) costs overhead; a false positive (large job in direct mode) costs correctness. When git is unavailable or reference/additive checks are inconclusive, triage defaults to **pipeline**.

Triage decisions append to `docs/triage-audit.jsonl` in CI (`--audit`). Review miscalibration via the weekly metrics artifact (`gateFailureTaxonomy`) and audit log — there is no auto-calibration in v1.

Local dry-run:

```bash
node .github/tier2-v3/scripts/triage-change.mjs --paths src/foo.ts,src/bar.ts
node .github/tier2-v3/scripts/check-checkpoints.mjs --triage-mode direct
```

Configure thresholds in `tier2-v3.config.json` → `triage.direct_mode` (`max_files`, `max_reference_count`, `allowed_prefixes`, `require_additive`).

**Path-aware plan requirement:** the checkpoint gate requires `spec/plan.md` only when the PR’s **changed files** touch implementation prefixes — not merely because an `src/` directory exists on disk.

---

## Two ways to implement

### A. Local coding agent (default day-to-day)

1. Clone the **service** repo (not the pattern monorepo) as the agent workspace.
2. Wire MCP from `.github/mcp/mcp.json.example` — see [LOCAL.md](LOCAL.md).
3. Prompt against a signed issue / `spec/tasks.md` row; require a **draft** PR.
4. Let checkpoint gate + spec review run on GitHub; you merge.

No `COPILOT_ASSIGN_TOKEN` required for this path.

### B. Copilot cloud coding agent

1. Issue uses the Feature template (spec ref + acceptance).
2. Add label **`ready-for-agent`** (configurable).
3. Workflow assigns Copilot → Copilot opens a **draft** PR.
4. Gate + review run; **you** merge.

Needs: coding agent enabled on the repo + secret **`COPILOT_ASSIGN_TOKEN`** (user PAT — `GITHUB_TOKEN` cannot assign). Details: [AGENTIC.md](AGENTIC.md).

You can use A and B on different issues; both must respect the same checkpoints.

---

## Batch pilots & backlog hygiene

When draining many findings (security assessment, remediation wave):

| Rule | Why |
| --- | --- |
| **Sequential slice lock** | One writer / one open impl branch at a time — parallel agents fight over shared `spec.md` / `plan.md` / `pr-evidence.md` |
| **Always pass `--repo owner/name` to `gh`** | Clones with an `upstream` remote can make `gh` target the wrong repo |
| **Dedupe before `gh issue create`** | Search open/closed issues for `[RA FINDING-ID]` first |
| **Close-on-ship** | Close the finding issue when the implementation PR merges (`Closes #n` in the PR body) |
| **Metrics reviews** | After signing a `[maintain]` metrics issue, close it or label `metrics:reviewed` — leave open only while action is pending |
| **Post-pass verification** | Before declaring a backlog “drained,” re-check each finding against the **original assessment Expected** (grep / inspect), not only against the signed slice. Track **slice complete** vs **finding remediated** separately |

### Pilot / deploy-pause mode

Set `pilot_mode.enabled: true` in config when practising the pipeline without production deploy prerequisites (GitHub Environment vars such as `lza-prod`). Spec/plan may say “do not deploy”; do not count production readiness as shipped until env vars exist.

---

## What CI enforces

| Workflow | Purpose |
| --- | --- |
| **Tier 2 v3 / Preflight** | Manual sanity (scripts, config) |
| **Checkpoint gate** | PR fails if required constitution/spec/plan/features are missing for the paths touched; **direct mode** relaxes plan/features to WARN; warns on missing `@R-xx.y` |
| **Provenance check** | WARN when acceptance/e2e tests lack `criterion: @R-xx.y` header |
| **Spec review** | Heuristic and/or LLM / gh-aw comment on implementation PRs |
| **Assign coding agent** | Label → Copilot (if enabled) |
| **Promote intent** | Label `intent-ready` → draft `intent/` PR from issue |
| **Metrics** | Weekly git + PR exhaust report (artifact only — not committed to main) |
| **Maintain** | Daily σ-band detection → draft `intent/maintain-{date}.md` PR (never auto-merge) |

If Tier 1 is enrolled, triage / docs drift / CI diagnose continue as in the [Tier 1 operate](../tier1/OPERATE.md) playbook — separate config file (`tier1.config.json`).

---

## Maintain loop (σ-band → intent)

Stage 6 closes the loop: a **deterministic** script watches leading/lagging metrics and writes maintain intents when control bands breach — no model in the detection path ([ainsdlc lesson 13](https://github.com/bcgov/ai-sdlc/blob/main/raw/ai-native-sdlc-playbook/13-closing-the-loop-on-metrics.md)).

| Path | Role |
| --- | --- |
| `maintain/bands.json` | Metric definitions, baseline window, σ tiers (log / diagnose / propose). Primary band: `ci_test_failure_rate` |
| `spec/criteria-index.json` | Generated criterion registry (`id`, `feature`, `scenario`, `tier`) for coverage + metrics |
| `intent/maintain-{date}.md` | Auto-drafted intent when a metric hits 3σ |

**Tier 2 v3 / Maintain** runs daily (07:00 UTC) or on demand. It prefers the weekly **metrics artifact** (`maintainSignals`) and falls back to live `gh` queries. At **1σ** the script logs only; at **2σ** it emits a read-only diagnose message; at **3σ** it writes a draft maintain intent and opens a **draft PR** on branch `intent/maintain-{date}` — same review gate as human-originated intents. The workflow **never auto-merges**.

### On-call triage

The on-call engineer (or repo maintainer) triages the maintain intent queue:

1. **Fix now** — treat like any intent: spec → plan → implement → draft PR → human merge.
2. **Schedule** — link the maintain intent to a backlog issue; dismiss the draft PR if duplicate.
3. **Dismiss** — false positive or known transient; close the draft PR and **tune `maintain/bands.json`** (widen baseline, adjust tiers, or add ignore rules) so repeat noise drops.

Dismissals are how bands learn: each dismissal should either update config or add an eval case (see harness evals) so the same class of incident does not re-fire.

Local dry-run (no branch/PR):

```bash
node .github/tier2-v3/scripts/detect-bands.mjs --dry-run --root .
```

Offline without `gh` (config load + render only):

```bash
node .github/tier2-v3/scripts/detect-bands.mjs --dry-run --root .  # skips gh queries, logs skip reasons
```

### Reading the metrics report

The **Tier 2 v3 / Metrics** workflow runs weekly (Monday 06:00 UTC) or on demand. It writes `docs/tier2-v3-metrics.json` locally in CI and uploads it as the **`tier2-v3-metrics`** artifact — the file is **not** committed to the default branch.

| Field | Meaning |
| --- | --- |
| `intentToSpecDays` | Days from first `intent/` (or `spec/intent.md`) commit to first `spec/spec.md` commit |
| `specToPlanDays` | Days from first spec commit to first plan commit |
| `planToFirstPrDays` | Days from first plan commit to earliest PR opened |
| `firstPassMergeRate` | Share of last 30 merged PRs with ≤1 commit (0–1) |
| `reworkCyclesPerPr` | Average extra commits per merged PR (commits − 1) |
| `gateFailureTaxonomy` | Counts of checkpoint-gate check failures (by check id when parseable) |
| `coverageStates` | Per `R-xx.y` ID: `specified` → `accepted` (on default branch) → `implemented` → `verified` |
| `costOfJudgment.reviewTurnsPerCheckpointPr` | Average human PR comment count on spec/plan/intent PRs (proxy for review turns) |
| `costOfJudgment.medianDaysAtCheckpoint` | Median days from open to merge on checkpoint PRs |
| `traceabilityQuality.criterionIdCoverage` | Share of Gherkin scenarios with `@R-xx.y` tags (`coverageRate`, `missingScenarios`) |
| `traceabilityQuality.provenanceCoverage` | Share of acceptance/e2e tests with valid `criterion: @R-xx.y` header |
| `traceabilityQuality.coverageSummary` | Counts per coverage state; `stalledCriteria` (no progress past `stall_days`); `orphanCriteria` (specified/accepted only) |
| `traceabilityQuality.implPrTraceability` | On last 30 merged impl PRs: `specTraceMissRate`, `reviewReceiptMissRate` |
| `maintainSignals.ci_test_failure_rate` | Daily failure-rate series for the maintain loop (prefer this over live re-query) |
| `maintainSignals.checkpointGatePassRate` | Share of recent checkpoint-gate runs that succeeded |

Nulls mean the artifact path did not exist yet or `gh` was unavailable. Toggle with `metrics.enabled` in `tier2-v3.config.json`; artifact path defaults to `metrics.artifact_path`. Regenerate the criterion registry anytime:

```bash
node .github/tier2-v3/scripts/generate-criteria-index.mjs --root .
``` Toggle with `metrics.enabled` in `tier2-v3.config.json`; artifact path defaults to `metrics.artifact_path`.

---

## Config you’ll actually touch

Root file: **`tier2-v3.config.json`**.

**CODEOWNERS** (written at enrol) is the allowManagedHooksOnly equivalent for GitHub: it blocks implementation agents from self-modifying gates, constitution, acceptance criteria, and pack config. Replace placeholder teams (`@bcgov/platform-architecture`, `@bcgov/qa-leads`) with your org’s GitHub teams or named owners before relying on branch protection.

| Knob | Typical use |
| --- | --- |
| `checkpoints.impl_path_prefixes` | Paths that require plan/features; include `.github/workflows/` for workflow-only fixes |
| `checkpoints.require_impl_paths_on_evidence_prs` | Fail evidence-only “impl” PRs (default true) |
| `checkpoints.require_signed_spec_before_impl` | Warn when impl paths change without plan/features (default true) |
| `pilot_mode.enabled` | Document deploy-pause / pipeline-test without prod env vars |
| `metrics.gate_taxonomy_exclude` | Drop non-blocking noise (e.g. `activation`, `agent`) from failure taxonomy |
| `checkpoints.strict_placeholders` | Tighten when scaffolds are filled |
| `spec_review.mode` | `heuristic` · `auto` · `llm` · `gh-aw` |
| `spec_review.require_evidence` / `evidence_path` | Expect `docs/pr-evidence.md` updates |
| `coding_agent.auto_assign` | `false` = label is human signal only |
| `coding_agent.assign_label` | Default `ready-for-agent` |
| `agent.llm.*` | Actions LLM for spec review (same secret family as Tier 1: `TIER1_LLM_*`) |
| `metrics.enabled` / `metrics.artifact_path` | Weekly metrics workflow; artifact path for local CLI runs |
| `triage.enabled` / `triage.direct_mode.*` | Risk-tiered ceremony thresholds; see Direct vs pipeline mode above |

`include_tier1: true` documents intent; enrol still needs `--with-tier1`.

### Review backends — stay on one writer

Same rule as Tier 1: don’t let Actions LLM **and** gh-aw both comment on every PR. Set `spec_review.mode` to match the backend you want. Tier 1’s `agent.mode` is independent — you may use gh-aw for triage and heuristic for spec review, or align them for simplicity.

---

## Normal weekly rhythm

1. **Preflight** after pack or config changes (Tier 2 and Tier 1 if present). Optionally download the latest **Metrics** artifact to track lead time and gate friction.
2. **Constitution PR** when standards change — treat it as architecture review, not a drive-by edit.
3. **One vertical slice** at a time: spec → plan → implement → draft PR → merge.
4. **Label hygiene** — only `ready-for-agent` when the slice is ready for a cloud agent (acceptance clear, checkpoints 1–2 done).
5. **Read gate failures** — missing feature file or plan usually means the PR is ahead of the paper trail; fix artifacts, don’t bypass.
6. **Evidence** — append to `docs/pr-evidence.md` (`generate.mjs --append`); fill **Review receipt** (Checked / Could not check / Residual risk).
7. **Close finding issues** on merge; close or label metrics review issues after triage.
8. **After a backlog wave** — run independent verification vs the source assessment before claiming drained.

---

## First-week checklist (after enrol)

- [ ] Actions: workflow permissions **Read and write**
- [ ] **Tier 2 v3 / Preflight** green (and Tier 1 preflight if enrolled)
- [ ] Replace constitution / spec placeholders for a thin pilot slice
- [ ] Open a constitution or spec PR and practice checkpoint 1
- [ ] Wire local MCP **or** set `COPILOT_ASSIGN_TOKEN` + confirm `copilot-swe-agent` is available
- [ ] Land one **draft** implementation PR; confirm checkpoint gate + spec review run
- [ ] Human merges (checkpoint 3) — confirm branch protection doesn’t allow bot self-merge

---

## Troubleshooting

| Symptom | Likely cause | What to try |
| --- | --- | --- |
| Checkpoint gate fails on every PR | Placeholders / missing `spec/` files / wrong `impl_path_prefixes` | Fill scaffold; align prefixes with real paths; see gate logs |
| Spec review silent | `spec_review.enabled: false` or mode/skip mismatch | Check config; ensure PR touches `spec_review.paths` |
| Double review comments | Actions + gh-aw both writing | One `spec_review.mode` |
| `ready-for-agent` no draft PR | Coding agent off, bad PAT, or assign workflow failed | `suggestedActors` / secret / workflow log — see AGENTIC.md |
| Local agent ignores DS / constitution | MCP not wired or wrong absolute paths | [LOCAL.md](LOCAL.md); rebuild MCP `dist/` |
| LLM review 403 | APIM private network vs GitHub-hosted runners | Use heuristic/gh-aw for review, or private runners — wiki pattern-packs status |
| Tier 1 quiet after Tier 2 v3 enrol | Forgot `--with-tier1` | Re-run enrol with the flag (keeps existing configs) |

Org blockers (APIM, Copilot): pattern monorepo `wiki/synthesis/bcgov-pattern-packs.md`, or ask platform.

---

## Updating the pack

```bash
./patterns/tier2-v3/enrol.sh /path/to/your-service --with-tier1 [--with-gh-aw]
```

Overwrites Tier 2 workflows/scripts; preserves existing `tier2-v3.config.json`, `tier1.config.json`, and filled `spec/` / constitution when already present. Diff carefully. Re-compile gh-aw locks after editing `.md` sources.

---

## Related docs

| Doc | Use when |
| --- | --- |
| [ENROL.md](ENROL.md) | First install |
| [AGENTIC.md](AGENTIC.md) | Modes, Copilot assign, Azure/APIM, gh-aw |
| [LOCAL.md](LOCAL.md) | IDE / local agent loop |
| Tier 1 operate | Intake automation — `.github/tier1/OPERATE.md` if enrolled with Tier 1 |
