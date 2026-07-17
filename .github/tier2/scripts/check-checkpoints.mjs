#!/usr/bin/env node
/**
 * Plain Node checkpoint gate — no gh-aw.
 * Usable via `node check-checkpoints.mjs` or as a local action entrypoint.
 */
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";

const args = process.argv.slice(2);
function flag(name, fallback = undefined) {
  const idx = args.indexOf(`--${name}`);
  if (idx === -1) return fallback;
  return args[idx + 1] ?? "true";
}

const root = path.resolve(flag("root", process.env.INPUT_ROOT || "."));
const strictPlaceholders =
  (flag("strict-placeholders", process.env.INPUT_STRICT_PLACEHOLDERS || "false") || "false") ===
  "true";
const requirePlanPrefixes = (
  flag("require-plan-on-paths", process.env.INPUT_REQUIRE_PLAN_ON_PATHS || "src/,apps/,services/,packages/,deploy/") ||
  ""
)
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);

const results = [];

function ok(id, message) {
  results.push({ id, status: "pass", message });
}
function warn(id, message) {
  results.push({ id, status: "warn", message });
}
function fail(id, message) {
  results.push({ id, status: "fail", message });
}

function read(rel) {
  const p = path.join(root, rel);
  if (!existsSync(p)) return null;
  return readFileSync(p, "utf8");
}

function findConstitution() {
  const candidates = [
    "constitution.md",
    ".specify/memory/constitution.md",
    "spec/constitution.md",
  ];
  for (const c of candidates) {
    if (existsSync(path.join(root, c))) return c;
  }
  return null;
}

function listFeatures() {
  const dir = path.join(root, "spec/features");
  if (!existsSync(dir)) return [];
  return readdirSync(dir).filter((f) => f.endsWith(".feature"));
}

function walkFiles(dir, acc = []) {
  if (!existsSync(dir)) return acc;
  for (const name of readdirSync(dir)) {
    if (name === "node_modules" || name === ".git" || name === "dist") continue;
    const p = path.join(dir, name);
    const st = statSync(p);
    if (st.isDirectory()) walkFiles(p, acc);
    else acc.push(p);
  }
  return acc;
}

function changedPathsHint() {
  // Optional: GITHUB_EVENT_PATH not required. Heuristic: if common impl dirs exist, require plan.
  return requirePlanPrefixes.some((prefix) => existsSync(path.join(root, prefix.replace(/\/$/, ""))));
}

// --- checks ---

const constitutionPath = findConstitution();
if (!constitutionPath) {
  fail("constitution_present", "No constitution.md found (tried root, .specify/memory/, spec/).");
} else {
  ok("constitution_present", `Found ${constitutionPath}`);
  const body = read(constitutionPath) || "";
  const required = ["P1", "P2", "P3", "P4", "P5", "P6", "P7", "P8"];
  const missing = required.filter((p) => !body.includes(`### ${p}`) && !body.includes(`## ${p}`));
  if (missing.length) {
    fail(
      "constitution_platform_articles",
      `Constitution missing platform article markers: ${missing.join(", ")} (expected ### P1 … ### P8)`,
    );
  } else {
    ok("constitution_platform_articles", "Platform articles P1–P8 markers present");
  }
  if (/\{\{[A-Z0-9_]+\}\}/.test(body)) {
    (strictPlaceholders ? fail : warn)(
      "constitution_placeholders",
      "Constitution still contains {{PLACEHOLDER}} tokens — fill before production use",
    );
  }
}

const spec = read("spec/spec.md");
if (!spec) {
  fail("spec_present", "spec/spec.md is missing");
} else {
  ok("spec_present", "spec/spec.md present");
  for (const heading of ["## Problem", "## Outcome", "## Scope"]) {
    if (!spec.includes(heading)) {
      warn("spec_structure", `spec.md missing recommended heading: ${heading}`);
    }
  }
  if (/\{\{[A-Z0-9_]+\}\}/.test(spec)) {
    (strictPlaceholders ? fail : warn)(
      "spec_placeholders",
      "spec.md still contains {{PLACEHOLDER}} tokens",
    );
  }
}

const plan = read("spec/plan.md");
const needsPlan = changedPathsHint();
if (!plan) {
  if (needsPlan) {
    fail("plan_present", "spec/plan.md missing but implementation directories exist — required for checkpoint 2");
  } else {
    warn("plan_present", "spec/plan.md missing (ok only before architecture work starts)");
  }
} else {
  ok("plan_present", "spec/plan.md present");
}

const features = listFeatures();
if (features.length === 0) {
  if (needsPlan) {
    fail("features_present", "No spec/features/*.feature files — acceptance criteria required");
  } else {
    warn("features_present", "No feature files yet");
  }
} else {
  ok("features_present", `${features.length} feature file(s): ${features.join(", ")}`);
}

// Report
const failed = results.filter((r) => r.status === "fail");
const warned = results.filter((r) => r.status === "warn");

console.log(`Checkpoint gate — root=${root}\n`);
for (const r of results) {
  const mark = r.status === "pass" ? "PASS" : r.status === "warn" ? "WARN" : "FAIL";
  console.log(`[${mark}] ${r.id}: ${r.message}`);
}
console.log(`\nSummary: ${results.length - failed.length - warned.length} pass, ${warned.length} warn, ${failed.length} fail`);

if (process.env.GITHUB_STEP_SUMMARY) {
  const lines = [
    "### Checkpoint gate",
    "",
    "| Status | Check | Message |",
    "| --- | --- | --- |",
    ...results.map((r) => `| ${r.status} | ${r.id} | ${r.message.replace(/\|/g, "\\|")} |`),
  ];
  try {
    const { appendFileSync } = await import("node:fs");
    appendFileSync(process.env.GITHUB_STEP_SUMMARY, lines.join("\n") + "\n");
  } catch {
    /* ignore */
  }
}

process.exit(failed.length ? 1 : 0);
