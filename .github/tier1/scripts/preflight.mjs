#!/usr/bin/env node
/**
 * Verify Tier 1 enrolment: config, workflows present, labels creatable.
 */
import { existsSync } from "node:fs";
import path from "node:path";
import { loadConfig, repoRoot } from "./lib/config.mjs";
import { ensureLabel, gh } from "./lib/gh.mjs";
import { hasLlmCredentials, resolveAgentMode } from "./lib/agent-mode.mjs";

const root = repoRoot();
const failures = [];
const warnings = [];

function ok(msg) {
  console.log(`PASS  ${msg}`);
}
function fail(msg) {
  console.log(`FAIL  ${msg}`);
  failures.push(msg);
}
function warn(msg) {
  console.log(`WARN  ${msg}`);
  warnings.push(msg);
}

let cfg;
try {
  cfg = loadConfig(root);
  ok("tier1.config.json loaded");
  const mode = resolveAgentMode(cfg);
  ok(`agent.mode → ${mode} (configured: ${cfg.agent?.mode || "heuristic"})`);
  if (mode === "llm" || cfg.agent?.mode === "auto") {
    if (hasLlmCredentials(cfg)) ok("LLM API key present in environment");
    else warn("No TIER1_LLM_API_KEY — auto/llm will use heuristic until secret is set");
  }
  if (mode === "gh-aw") {
    const md = ["tier1-triage.md", "tier1-docs-drift.md", "tier1-ci-diagnose.md"];
    for (const f of md) {
      if (existsSync(path.join(root, ".github/workflows", f))) ok(`gh-aw source ${f}`);
      else warn(`gh-aw source missing: .github/workflows/${f}`);
      const lock = f.replace(/\.md$/, ".lock.yml");
      if (existsSync(path.join(root, ".github/workflows", lock))) ok(`gh-aw lock ${lock}`);
      else warn(`gh-aw lock missing: ${lock} — run gh aw compile`);
    }
  }
} catch (e) {
  fail(e.message);
  cfg = null;
}

const requiredWorkflows = [
  "tier1-preflight.yml",
  "tier1-triage.yml",
  "tier1-docs-drift.yml",
  "tier1-ci-diagnose.yml",
];
for (const w of requiredWorkflows) {
  const p = path.join(root, ".github/workflows", w);
  if (existsSync(p)) ok(`workflow ${w}`);
  else fail(`missing .github/workflows/${w}`);
}

const scriptsDir = path.join(root, ".github/tier1/scripts");
const altScripts = path.join(root, "tier1/scripts");
const scriptsRoot = existsSync(scriptsDir)
  ? scriptsDir
  : existsSync(altScripts)
    ? altScripts
    : null;
if (scriptsRoot) ok(`scripts at ${path.relative(root, scriptsRoot)}`);
else fail("missing Tier 1 scripts (.github/tier1/scripts or tier1/scripts)");

if (cfg?.preflight?.require_labels !== false) {
  const labels = [
    cfg?.triage?.default_label,
    cfg?.triage?.needs_detail_label,
    "bug",
    "enhancement",
    "tier1-docs-drift",
  ].filter(Boolean);
  try {
    gh(["auth", "status"]);
    for (const name of labels) {
      ensureLabel(name);
    }
    ok(`labels ensured: ${labels.join(", ")}`);
  } catch (e) {
    warn(`could not ensure labels via gh: ${e.message}`);
  }
}

if (existsSync(path.join(root, "AGENTS.md"))) ok("AGENTS.md present");
else warn("AGENTS.md missing — copy AGENTS.tier1.md → AGENTS.md");

console.log("");
console.log(`Summary: ${failures.length} fail, ${warnings.length} warn`);
if (failures.length) process.exit(1);
console.log("Tier 1 preflight OK");
