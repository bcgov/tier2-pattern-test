#!/usr/bin/env node
/** Tier 2 preflight: config, spec scaffold, tier1 optional, workflows */
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = process.env.GITHUB_WORKSPACE || process.cwd();
const fail = [];
const warn = [];
const ok = (m) => console.log(`PASS  ${m}`);
const bad = (m) => {
  console.log(`FAIL  ${m}`);
  fail.push(m);
};
const wrn = (m) => {
  console.log(`WARN  ${m}`);
  warn.push(m);
};

const cfgPath = path.join(root, "tier2-v3.config.json");
if (!existsSync(cfgPath)) bad("missing tier2-v3.config.json");
else {
  ok("tier2-v3.config.json");
  const cfg = JSON.parse(readFileSync(cfgPath, "utf8"));
  if (cfg.tier !== 2 && cfg.pack_version !== 2) wrn("tier field should be 2 (pack_version 2 for v2 pack)");
  else if (cfg.tier === 2 && cfg.pack_version === 2) ok("tier 2 pack_version 2");
  else if (cfg.tier === 2) ok("tier 2");
}

for (const f of [
  "spec/spec.md",
  "spec/plan.md",
  "spec/tasks.md",
  ".specify/memory/constitution.md",
  "AGENTS.md",
]) {
  if (existsSync(path.join(root, f)) || (f.includes("constitution") && existsSync(path.join(root, "constitution.md"))))
    ok(f.replace(".specify/memory/constitution.md", "constitution present"));
  else bad(`missing ${f}`);
}

const features = path.join(root, "spec/features");
if (existsSync(features)) ok("spec/features/");
else bad("missing spec/features/");

for (const w of [
  "tier2-v3-preflight.yml",
  "tier2-v3-checkpoint-gate.yml",
  "tier2-v3-spec-review.yml",
  "tier2-v3-assign-coding-agent.yml",
  "tier2-v3-harness-evals.yml",
]) {
  if (existsSync(path.join(root, ".github/workflows", w))) ok(`workflow ${w}`);
  else bad(`missing workflow ${w}`);
}

const evalsRoot = path.join(root, ".github/tier2-v3/evals");
const evalManifest = path.join(evalsRoot, "manifest.json");
if (existsSync(evalManifest)) {
  try {
    const manifest = JSON.parse(readFileSync(evalManifest, "utf8"));
    if (!Array.isArray(manifest.tasks) || manifest.tasks.length === 0) {
      bad("evals/manifest.json: tasks must be a non-empty array");
    } else {
      for (const id of manifest.tasks) {
        const taskPath = path.join(evalsRoot, "tasks", `${id}.json`);
        if (!existsSync(taskPath)) bad(`evals missing task ${id}.json`);
        else JSON.parse(readFileSync(taskPath, "utf8"));
      }
      ok(`evals manifest (${manifest.tasks.length} tasks)`);
    }
  } catch (e) {
    bad(`evals manifest parse error: ${e.message}`);
  }
} else wrn("evals/manifest.json missing — re-enrol or copy patterns/tier2-v3/evals/");

const cfgFull = existsSync(cfgPath) ? JSON.parse(readFileSync(cfgPath, "utf8")) : {};
if (cfgFull.coding_agent?.auto_assign !== false) {
  ok("coding_agent.auto_assign enabled (needs secret COPILOT_ASSIGN_TOKEN at runtime)");
}

if (existsSync(path.join(root, ".github/workflows", "tier2-v3-spec-review.md"))) {
  ok("gh-aw source tier2-v3-spec-review.md");
  if (existsSync(path.join(root, ".github/workflows", "tier2-v3-spec-review.lock.yml")))
    ok("gh-aw lock tier2-v3-spec-review.lock.yml");
  else wrn("gh-aw lock missing — run gh aw compile");
}

if (existsSync(path.join(root, "tier1.config.json"))) ok("tier1.config.json (Tier 1 included)");
else wrn("tier1 not enrolled — run enrol with --with-tier1");

if (existsSync(path.join(root, "docs/public-service-minimums.md"))) ok("public-service minimums doc");
else wrn("copy packs/public-service-minimums/checklist.md → docs/public-service-minimums.md");

console.log(`\nSummary: ${fail.length} fail, ${warn.length} warn`);
process.exit(fail.length ? 1 : 0);
