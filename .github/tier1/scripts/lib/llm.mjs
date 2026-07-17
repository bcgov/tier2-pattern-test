/**
 * OpenAI-compatible Chat Completions client (Azure OpenAI / MaaS gateway / OpenAI).
 */

export function llmConfigFrom(cfg) {
  const llm = cfg.agent?.llm || {};
  const keyEnv = llm.api_key_env || "TIER1_LLM_API_KEY";
  const apiKey =
    process.env[keyEnv] || process.env.TIER1_LLM_API_KEY || process.env.OPENAI_API_KEY || "";
  const baseUrl = (
    process.env.TIER1_LLM_BASE_URL ||
    llm.base_url ||
    "https://api.openai.com/v1"
  ).replace(/\/$/, "");
  const model = process.env.TIER1_LLM_MODEL || llm.model || "gpt-4o-mini";
  const apiStyle = llm.api_style || process.env.TIER1_LLM_API_STYLE || "openai"; // openai | azure
  return { apiKey, baseUrl, model, apiStyle };
}

/**
 * @param {object} cfg tier1 config
 * @param {string} system
 * @param {string} user
 * @param {{ json?: boolean }} opts
 * @returns {Promise<string|null>} null on failure
 */
export async function chatCompletion(cfg, system, user, opts = {}) {
  const { apiKey, baseUrl, model, apiStyle } = llmConfigFrom(cfg);
  if (!apiKey) {
    console.warn("LLM: no API key — falling back");
    return null;
  }

  let url = `${baseUrl}/chat/completions`;
  const headers = {
    "Content-Type": "application/json",
  };

  if (apiStyle === "azure") {
    // baseUrl should be like https://{resource}.openai.azure.com/openai/deployments/{deployment}
    const apiVersion = cfg.agent?.llm?.api_version || process.env.TIER1_LLM_API_VERSION || "2024-08-01-preview";
    url = `${baseUrl}/chat/completions?api-version=${encodeURIComponent(apiVersion)}`;
    headers["api-key"] = apiKey;
  } else {
    headers.Authorization = `Bearer ${apiKey}`;
  }

  const body = {
    model: apiStyle === "azure" ? undefined : model,
    temperature: cfg.agent?.llm?.temperature ?? 0.2,
    messages: [
      { role: "system", content: system },
      { role: "user", content: user },
    ],
  };
  if (apiStyle === "azure") delete body.model;
  if (opts.json) {
    body.response_format = { type: "json_object" };
  }

  try {
    const res = await fetch(url, {
      method: "POST",
      headers,
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      const text = await res.text();
      console.warn(`LLM HTTP ${res.status}: ${text.slice(0, 400)}`);
      return null;
    }
    const data = await res.json();
    const content = data.choices?.[0]?.message?.content;
    return typeof content === "string" ? content : null;
  } catch (err) {
    console.warn(`LLM request failed: ${err.message}`);
    return null;
  }
}

export function parseJsonLoose(text) {
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch {
    const m = text.match(/\{[\s\S]*\}/);
    if (!m) return null;
    try {
      return JSON.parse(m[0]);
    } catch {
      return null;
    }
  }
}
