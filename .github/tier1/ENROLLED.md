# Tier 1 enrolled

Pack source: patterns/tier1
Enrolled at: 2026-07-17T21:45:06Z
gh-aw sources: true

Next:
1. Edit `tier1.config.json` — `project` and `agent.mode` (`auto` | `heuristic` | `llm` | `gh-aw`).
2. For LLM: add repo secret `TIER1_LLM_API_KEY` (see .github/tier1/AGENTIC.md).
3. For gh-aw: `gh extension install github/gh-aw && gh aw compile`, commit `*.lock.yml`, set mode `gh-aw`.
4. Push; enable Actions; workflow permissions Read and write.
5. Run **Tier 1 / Preflight**.
6. Test triage / demo-fail / docs-drift.
