# Tier 1 enrolled

Pack source: patterns/tier1
Enrolled at: 2026-09-10T21:51:49Z
gh-aw sources: false

Next:
1. Edit `tier1.config.json` — `project` and `agent.mode` (`auto` | `heuristic` | `llm` | `gh-aw`).
2. For LLM: add repo secret `TIER1_LLM_API_KEY` (see .github/tier1/AGENTIC.md).
3. For gh-aw: `gh extension install github/gh-aw && gh aw compile`, commit `*.lock.yml`, set mode `gh-aw`.
4. Push; enable Actions; workflow permissions Read and write.
5. Run **Tier 1 / Preflight**.
6. Test triage / demo-fail / docs-drift.
7. Day-to-day ops: `.github/tier1/OPERATE.md`.
