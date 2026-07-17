# Tier 1 agent backends

Three ways to run triage / docs-drift / CI diagnose:

| Mode | Config | Where the “agent” is | Secrets |
| --- | --- | --- | --- |
| `heuristic` | default | None — keyword/timestamp/log rules | `GITHUB_TOKEN` only |
| `llm` or `auto` | `agent.mode` + LLM settings | OpenAI-compatible model via Actions scripts | `TIER1_LLM_API_KEY` (+ optional base URL/model) |
| `gh-aw` | `agent.mode: "gh-aw"` | GitHub Agentic Workflows coding agent | Copilot org billing or `COPILOT_GITHUB_TOKEN` |

```json
{
  "agent": {
    "mode": "auto",
    "llm": {
      "base_url": "https://api.openai.com/v1",
      "model": "gpt-4o-mini",
      "api_key_env": "TIER1_LLM_API_KEY",
      "api_style": "openai"
    }
  }
}
```

- **`auto`** — use LLM when `TIER1_LLM_API_KEY` (or env named in `api_key_env`) is set; otherwise heuristic.  
- **`llm`** — always attempt LLM; fall back to heuristic on API failure.  
- **`gh-aw`** — Actions Node jobs **skip**; run compiled workflows from [`gh-aw/`](gh-aw/).  
- **Azure OpenAI:** set `api_style` to `"azure"` and `base_url` to your deployment URL (`.../openai/deployments/{name}`), secret as API key.

## Repo secrets / variables

| Name | Used by |
| --- | --- |
| `TIER1_LLM_API_KEY` | LLM path |
| `TIER1_LLM_BASE_URL` | optional override |
| `TIER1_LLM_MODEL` | optional override |
| `COPILOT_GITHUB_TOKEN` | gh-aw on personal repos / without org billing |

## Avoid double agents

Do not run LLM Actions **and** gh-aw on the same event with both writing comments. Pick one mode in `tier1.config.json`.
