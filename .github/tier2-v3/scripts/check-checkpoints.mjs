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
  flag(
    "require-plan-on-paths",
    process.env.INPUT_REQUIRE_PLAN_ON_PATHS ||
      "src/,apps/,services/,packages/,deploy/,server/,.github/workflows/",
  ) || ""
)
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);
const triageMode = (flag("triage-mode", process.env.INPUT_TRIAGE_MODE || "pipeline") || "pipeline").toLowerCase();
const isDirectMode = triageMode === "direct";
const changedPathsRaw =
  flag("changed-paths", process.env.INPUT_CHANGED_PATHS || process.env.CHANGED_PATHS || "") || "";
const changedPaths = changedPathsRaw
  .split(",")
  .map((s) => s.trim().replace(/\\/g, "/"))
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


function auditCriterionIds() {
  const features = listFeatures();
  if (features.length === 0) return;

  const missing = [];
  for (const file of features) {
    const body = read(`spec/features/${file}`) || "";
    const lines = body.split("\n");
    for (let i = 0; i < lines.length; i++) {
      if (!/^\s*Scenario(?: Outline)?:/.test(lines[i])) continue;
      let hasId = false;
      for (let j = i - 1; j >= 0; j--) {
        const line = lines[j].trim();
        if (!line) continue;
        if (line.startsWith("#")) break;
        if (/@R-\d+\.\d+/.test(line)) {
          hasId = true;
          break;
        }
        if (!line.startsWith("@")) break;
      }
      if (!hasId) missing.push(`${file}: ${lines[i].trim()}`);
    }
  }

  if (missing.length) {
    warn(
      "criterion_ids",
      `${missing.length} scenario(s) missing @R-xx.y tags: ${missing.slice(0, 3).join("; ")}${missing.length > 3 ? "…" : ""}`,
    );
  } else {
    ok("criterion_ids", "All scenarios carry @R-xx.y criterion IDs");
  }
}

function loadConfig() {
  const configPath = path.join(root, "tier2-v3.config.json");
  if (!existsSync(configPath)) return {};
  try {
    return JSON.parse(readFileSync(configPath, "utf8"));
  } catch {
    return {};
  }
}

function listIntentFiles() {
  const dir = path.join(root, "intent");
  if (!existsSync(dir)) return [];
  return readdirSync(dir).filter((f) => f.endsWith(".md") && f !== ".template.md");
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

function touchesImplPaths() {
  // Prefer PR changed paths (passed from workflow). Fall back to directory existence only
  // when no path list is available (local dry-run without --changed-paths).
  if (changedPaths.length > 0) {
    return changedPaths.some((p) =>
      requirePlanPrefixes.some((prefix) => p.startsWith(prefix.replace(/\/$/, "") + "/") || p === prefix.replace(/\/$/, "") || p.startsWith(prefix)),
    );
  }
  return requirePlanPrefixes.some((prefix) =>
    existsSync(path.join(root, prefix.replace(/\/$/, ""))),
  );
}

function pathNorm(p) {
  return String(p || "").replace(/\\/g, "/");
}

/** Evidence-only impl PRs (LOG-002 class): claim a fix but only touch docs/pr-evidence.md. */
function auditEvidenceOnlyImpl() {
  if (changedPaths.length === 0) return;
  const cfg = loadConfig();
  if (cfg?.checkpoints?.require_impl_paths_on_evidence_prs === false) return;

  const evidencePath = cfg?.spec_review?.evidence_path || "docs/pr-evidence.md";
  const touchesEvidence = changedPaths.some((p) => pathNorm(p) === evidencePath);
  if (!touchesEvidence) return;

  const touchesImpl = touchesImplPaths();
  if (touchesImpl) {
    ok("evidence_with_impl", "PR updates evidence and touches implementation paths");
    return;
  }

  // Docs-only PRs that only update evidence are fine (checkpoint docs, backfills).
  // Fail when the PR looks like an implementation claim (fix:/feat:/[RA …]/Closes).
  const titleBody = `${process.env.PR_TITLE || ""} ${process.env.PR_BODY || ""}`;
  const looksLikeImpl =
    /\b(fix|feat|implement)\b/i.test(titleBody) ||
    /\[\s*RA\s+[A-Z]+-\d+\s*\]/i.test(titleBody) ||
    /\b(Closes|Fixes)\s+#\d+/i.test(titleBody);

  const onlyDocsOrSpecMeta = changedPaths.every((p) => {
    const n = pathNorm(p);
    return (
      n === evidencePath ||
      n.startsWith("docs/") ||
      n.startsWith("spec/") ||
      n === "README.md" ||
      n === "AGENTS.md"
    );
  });

  if (looksLikeImpl && onlyDocsOrSpecMeta) {
    fail(
      "evidence_only_impl",
      `Implementation-shaped PR updates ${evidencePath} but touches no implementation paths ` +
        `(${requirePlanPrefixes.join(", ")}). Evidence without a code/workflow diff is not a fix ` +
        `(agentic-b LOG-002 lesson). Include the finding Location paths in this PR.`,
    );
  } else if (!touchesImpl && touchesEvidence) {
    warn(
      "evidence_without_impl",
      "PR updates pr-evidence without implementation paths — ok for docs/backfill; not for claiming a code fix",
    );
  }
}

/** Prefer signed features+plan when touching impl paths (trilogy order). */
function auditTrilogyOrder() {
  const cfg = loadConfig();
  if (cfg?.checkpoints?.require_signed_spec_before_impl === false) return;
  if (!touchesImplPaths()) return;

  const features = listFeatures();
  const plan = read("spec/plan.md");
  if (!plan || features.length === 0) {
    // plan_present / features_present already fail in pipeline mode; reinforce message
    warn(
      "trilogy_order",
      "Implementation paths changed — ensure signed spec features and plan exist before merge (spec → plan → implement)",
    );
  } else {
    ok("trilogy_order", "Impl paths changed with plan + feature files present");
  }
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

const codeowners = read("CODEOWNERS");
if (!codeowners || !/\/\.github\//.test(codeowners)) {
  warn("codeowners_present", "CODEOWNERS missing or does not protect .github/ — gates are agent-modifiable");
} else {
  ok("codeowners_present", "CODEOWNERS protects enforcement paths");
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

const config = loadConfig();
const requireIntent = config?.checkpoints?.require_intent === true;
if (requireIntent && spec) {
  const intents = listIntentFiles();
  if (intents.length === 0) {
    warn(
      "intent_present",
      "spec/spec.md exists but no intent/*.md files found (excluding .template.md)",
    );
  } else {
    ok("intent_present", `${intents.length} intent file(s): ${intents.join(", ")}`);
  }
}

const plan = read("spec/plan.md");
const needsPlan = touchesImplPaths();
if (!plan) {
  if (needsPlan) {
    (isDirectMode ? warn : fail)(
      "plan_present",
      isDirectMode
        ? "spec/plan.md missing (direct mode — warn only; full pipeline requires plan)"
        : changedPaths.length
          ? "spec/plan.md missing but this PR touches implementation paths — required for checkpoint 2"
          : "spec/plan.md missing but implementation directories exist — required for checkpoint 2",
    );
  } else {
    warn("plan_present", "spec/plan.md missing (ok only before architecture work starts)");
  }
} else {
  ok("plan_present", "spec/plan.md present");
}

const features = listFeatures();
if (features.length === 0) {
  if (needsPlan) {
    (isDirectMode ? warn : fail)(
      "features_present",
      isDirectMode
        ? "No spec/features/*.feature files (direct mode — warn only)"
        : "No spec/features/*.feature files — acceptance criteria required",
    );
  } else {
    warn("features_present", "No feature files yet");
  }
} else {
  ok("features_present", `${features.length} feature file(s): ${features.join(", ")}`);
  auditCriterionIds();
}

auditEvidenceOnlyImpl();
auditTrilogyOrder();

// Report
const failed = results.filter((r) => r.status === "fail");
const warned = results.filter((r) => r.status === "warn");

console.log(`Checkpoint gate — root=${root} triage-mode=${triageMode}\n`);
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
