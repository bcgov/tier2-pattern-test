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
### Azure OpenAI / APIM

**Native Azure:**

```json
"agent": {
  "mode": "auto",
  "llm": {
    "api_style": "azure",
    "base_url": "https://YOUR_RESOURCE.openai.azure.com/openai/deployments/YOUR_DEPLOYMENT",
    "api_version": "2024-12-01-preview",
    "api_key_env": "TIER1_LLM_API_KEY"
  }
}
```

**APIM front door** (subscription key) — use `azure-apim` (auto if host is `*.azure-api.net`):

```json
"agent": {
  "mode": "auto",
  "llm": {
    "api_style": "azure-apim",
    "base_url": "https://YOUR_APIM.azure-api.net/YOUR_PRODUCT/openai/deployments/YOUR_DEPLOYMENT",
    "api_version": "2024-12-01-preview",
    "api_key_env": "TIER1_LLM_API_KEY"
  }
}
```

`base_url` must include `/openai/deployments/{deployment-name}` (no trailing slash). APIM auth uses `Ocp-Apim-Subscription-Key`.

## Repo secrets / variables

| Name | Used by |
| --- | --- |
| `TIER1_LLM_API_KEY` | Azure / OpenAI API key |
| `TIER1_LLM_BASE_URL` | optional override of `agent.llm.base_url` |
| `TIER1_LLM_MODEL` | optional (ignored for Azure; deployment is in the URL) |
| `TIER1_LLM_API_STYLE` | optional Actions var: `azure` |
| `TIER1_LLM_API_VERSION` | optional Actions var (default `2024-08-01-preview`) |
| `COPILOT_GITHUB_TOKEN` | gh-aw on personal repos / without org billing |

## Avoid double agents

Do not run LLM Actions **and** gh-aw on the same event with both writing comments. Pick one mode in `tier1.config.json`.
