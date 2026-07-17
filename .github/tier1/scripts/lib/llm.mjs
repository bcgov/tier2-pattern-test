/**
 * OpenAI-compatible Chat Completions client (Azure OpenAI / APIM / OpenAI).
 *
 * Azure / APIM base_url form:
 *   https://{host}/{product}/openai/deployments/{deployment}
 * Auth:
 *   api_style "azure"     → header api-key (native Azure OpenAI)
 *   api_style "azure-apim"→ header Ocp-Apim-Subscription-Key (+ api-key mirror)
 */

export function llmConfigFrom(cfg) {
  const llm = cfg.agent?.llm || {};
  const keyEnv = llm.api_key_env || "TIER1_LLM_API_KEY";
  const apiKey =
    process.env[keyEnv] ||
    process.env.TIER1_LLM_API_KEY ||
    process.env.AZURE_OPENAI_API_KEY ||
    process.env.OPENAI_API_KEY ||
    "";

  let baseUrl = (
    process.env.TIER1_LLM_BASE_URL ||
    llm.base_url ||
    buildAzureBaseFromEnv() ||
    "https://api.openai.com/v1"
  ).replace(/\/$/, "");

  const model =
    process.env.TIER1_LLM_MODEL ||
    process.env.AZURE_OPENAI_DEPLOYMENT ||
    llm.model ||
    "gpt-4o-mini";

  let apiStyle = (llm.api_style || process.env.TIER1_LLM_API_STYLE || "openai").toLowerCase();
  if (apiStyle === "azure" && /azure-api\.net/i.test(baseUrl)) {
    apiStyle = "azure-apim";
  }

  const apiVersion =
    llm.api_version ||
    process.env.TIER1_LLM_API_VERSION ||
    process.env.AZURE_OPENAI_API_VERSION ||
    "2024-08-01-preview";

  return { apiKey, baseUrl, model, apiStyle, apiVersion, llm };
}

function buildAzureBaseFromEnv() {
  const endpoint = (process.env.AZURE_OPENAI_ENDPOINT || "").replace(/\/$/, "");
  const deployment = process.env.AZURE_OPENAI_DEPLOYMENT || "";
  if (!endpoint || !deployment) return "";
  // If endpoint already includes /openai/deployments/..., use as-is
  if (/\/openai\/deployments\//i.test(endpoint)) return endpoint;
  return `${endpoint}/openai/deployments/${deployment}`;
}

/**
 * @param {object} cfg tier1/tier2 config
 * @param {string} system
 * @param {string} user
 * @param {{ json?: boolean }} opts
 * @returns {Promise<string|null>} null on failure
 */
export async function chatCompletion(cfg, system, user, opts = {}) {
  const { apiKey, baseUrl, model, apiStyle, apiVersion, llm } = llmConfigFrom(cfg);
  if (!apiKey) {
    console.warn("LLM: no API key — falling back");
    return null;
  }

  let url = `${baseUrl}/chat/completions`;
  const headers = {
    "Content-Type": "application/json",
  };

  const isAzure = apiStyle === "azure" || apiStyle === "azure-apim";

  if (isAzure) {
    url = `${baseUrl}/chat/completions?api-version=${encodeURIComponent(apiVersion)}`;
    if (apiStyle === "azure-apim") {
      headers["Ocp-Apim-Subscription-Key"] = apiKey;
      headers["api-key"] = apiKey; // some APIM policies forward api-key
    } else {
      headers["api-key"] = apiKey;
    }
  } else {
    headers.Authorization = `Bearer ${apiKey}`;
  }

  const body = {
    messages: [
      { role: "system", content: system },
      { role: "user", content: user },
    ],
  };

  // Some newer models reject temperature; only set when configured
  if (llm.temperature !== undefined && llm.temperature !== null) {
    body.temperature = llm.temperature;
  } else if (!isAzure) {
    body.temperature = 0.2;
  }

  if (!isAzure) body.model = model;
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
