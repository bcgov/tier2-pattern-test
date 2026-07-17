#!/usr/bin/env node
/**
 * Issue triage — heuristic and/or LLM.
 * Env: ISSUE_NUMBER. Skips when agent.mode=gh-aw.
 */
import { loadConfig, repoRoot } from "./lib/config.mjs";
import { ensureLabel, gh } from "./lib/gh.mjs";
import { resolveAgentMode, skipIfGhAw } from "./lib/agent-mode.mjs";
import { chatCompletion, parseJsonLoose } from "./lib/llm.mjs";

function arg(name) {
  const i = process.argv.indexOf(`--${name}`);
  return i === -1 ? undefined : process.argv[i + 1];
}

const root = repoRoot();
const cfg = loadConfig(root);
if (!cfg.triage?.enabled) {
  console.log("triage disabled in tier1.config.json");
  process.exit(0);
}

const mode = resolveAgentMode(cfg);
console.log(`agent.mode resolved: ${mode}`);
if (skipIfGhAw(mode, "issue triage")) process.exit(0);

const issueNumber = arg("issue") || process.env.ISSUE_NUMBER;
if (!issueNumber) {
  console.error("Set ISSUE_NUMBER or --issue");
  process.exit(1);
}

const raw = gh([
  "issue",
  "view",
  String(issueNumber),
  "--json",
  "title,body,labels,number",
]);
const issue = JSON.parse(raw);
const allowedLabels = [
  ...(cfg.triage.label_rules || []).map((r) => r.label),
  cfg.triage.default_label,
  cfg.triage.needs_detail_label,
].filter(Boolean);

const heuristic = heuristicTriage(cfg, issue);
let decision = { ...heuristic, source: "heuristic" };

if (mode === "llm") {
  const llmDecision = await llmTriage(cfg, issue, allowedLabels, heuristic);
  if (llmDecision) decision = { ...llmDecision, source: "llm" };
  else console.warn("LLM triage failed — using heuristic");
}

const existing = new Set((issue.labels || []).map((l) => l.name));
const toAdd = (decision.labels || []).filter((l) => allowedLabels.includes(l) && !existing.has(l));

for (const label of new Set(toAdd)) {
  ensureLabel(label);
  gh(["issue", "edit", String(issueNumber), "--add-label", label]);
  console.log(`Added label: ${label}`);
}

if (decision.comment) {
  const header = `### Tier 1 triage (${cfg.project || "repo"}) · \`${decision.source}\`\n\n`;
  gh(["issue", "comment", String(issueNumber), "--body", header + decision.comment]);
  console.log("Posted comment");
}

console.log(JSON.stringify({ issue: issue.number, mode, decision, labelsAdded: toAdd }, null, 2));

function heuristicTriage(cfg, issue) {
  const text = `${issue.title || ""}\n${issue.body || ""}`.toLowerCase();
  const bodyLen = (issue.body || "").trim().length;
  const labels = [];
  for (const rule of cfg.triage.label_rules || []) {
    if (text.includes(String(rule.match).toLowerCase())) labels.push(rule.label);
  }
  if (labels.length === 0 && cfg.triage.default_label) labels.push(cfg.triage.default_label);

  const needsDetail = bodyLen < (cfg.triage.min_body_length ?? 80);
  if (needsDetail && cfg.triage.needs_detail_label) labels.push(cfg.triage.needs_detail_label);

  let comment = null;
  if (needsDetail) {
    comment = [
      "Thanks for the issue. Please add enough detail for someone to act on it:",
      "",
      "- **Problem** — what is going wrong?",
      "- **Expected** — what should happen?",
      "- **Actual** — what happens instead?",
      "- **Steps** — how to reproduce (if applicable)",
      "",
      `_Heuristic · body length ${bodyLen} < ${cfg.triage.min_body_length}_`,
    ].join("\n");
  }
  return { labels: [...new Set(labels)], needsDetail, comment };
}

async function llmTriage(cfg, issue, allowedLabels, fallback) {
  const system = `You triage GitHub issues for a BC Gov service repo.
Return JSON only: {"labels":string[],"needsDetail":boolean,"comment":string|null}
Rules:
- labels must be chosen from: ${allowedLabels.join(", ")}
- needsDetail true if reproduction/expected/actual are missing
- comment: short markdown asking for missing info, or null if issue is complete
- Prefer precision over many labels (1-3 labels)`;

  const user = `Title: ${issue.title}\n\nBody:\n${issue.body || "(empty)"}\n\nHeuristic suggestion: ${JSON.stringify(fallback)}`;
  const content = await chatCompletion(cfg, system, user, { json: true });
  const parsed = parseJsonLoose(content);
  if (!parsed || !Array.isArray(parsed.labels)) return null;
  return {
    labels: parsed.labels.filter((l) => allowedLabels.includes(l)),
    needsDetail: Boolean(parsed.needsDetail),
    comment: parsed.comment || (parsed.needsDetail ? fallback.comment : null),
  };
}
