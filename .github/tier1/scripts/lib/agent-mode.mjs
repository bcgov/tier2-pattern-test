/**
 * Resolve Tier 1 agent backend.
 * Modes: heuristic | llm | gh-aw | auto
 *   auto → llm if API key present, else heuristic
 */
export function resolveAgentMode(cfg) {
  const configured = (cfg.agent?.mode || process.env.TIER1_AGENT_MODE || "heuristic")
    .toString()
    .toLowerCase();

  if (configured === "gh-aw" || configured === "ghaw") return "gh-aw";
  if (configured === "heuristic" || configured === "rules") return "heuristic";
  if (configured === "llm") return "llm";

  // auto
  if (hasLlmCredentials(cfg)) return "llm";
  return "heuristic";
}

export function hasLlmCredentials(cfg) {
  const keyEnv = cfg.agent?.llm?.api_key_env || "TIER1_LLM_API_KEY";
  const key = process.env[keyEnv] || process.env.TIER1_LLM_API_KEY || process.env.OPENAI_API_KEY;
  return Boolean(key && String(key).trim());
}

export function skipIfGhAw(mode, jobName) {
  if (mode === "gh-aw") {
    console.log(
      `Skipping Actions job "${jobName}" — agent.mode is gh-aw. Use compiled .lock.yml workflows from gh-aw/*.md`,
    );
    return true;
  }
  return false;
}
