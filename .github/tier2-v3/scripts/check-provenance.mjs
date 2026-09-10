#!/usr/bin/env node
/**
 * Verify acceptance tests declare criterion provenance (Alex deliberate-blindness lite).
 * Expects a header comment: criterion: @R-xx.y (or criterion: R-xx.y)
 */
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const PROVENANCE_RE = /criterion:\s*@?R-\d+\.\d+/i;
const TEST_SUFFIXES = [".test.ts", ".test.tsx", ".test.js", ".spec.ts", ".spec.tsx", ".spec.js"];

function arg(name, fallback) {
  const i = process.argv.indexOf(`--${name}`);
  if (i === -1) return fallback;
  return process.argv[i + 1] ?? fallback;
}

function loadConfig(root) {
  const p = path.join(root, "tier2-v3.config.json");
  if (!existsSync(p)) return {};
  try {
    return JSON.parse(readFileSync(p, "utf8"));
  } catch {
    return {};
  }
}

function walk(dir, acc = []) {
  if (!existsSync(dir)) return acc;
  for (const name of readdirSync(dir)) {
    if (name === "node_modules" || name === ".git") continue;
    const p = path.join(dir, name);
    const st = statSync(p);
    if (st.isDirectory()) walk(p, acc);
    else acc.push(p);
  }
  return acc;
}

function isTestFile(rel) {
  const norm = rel.replace(/\\/g, "/");
  if (norm.includes("/acceptance/")) return true;
  if (norm.includes("/e2e/")) return true;
  return TEST_SUFFIXES.some((s) => norm.endsWith(s));
}

function loadCriterionIds(root) {
  const dir = path.join(root, "spec/features");
  const ids = new Set();
  if (!existsSync(dir)) return ids;
  for (const name of readdirSync(dir).filter((f) => f.endsWith(".feature"))) {
    const body = readFileSync(path.join(dir, name), "utf8");
    for (const m of body.matchAll(/@R-(\d+\.\d+)/g)) ids.add(`R-${m[1]}`);
  }
  return ids;
}

function checkFile(absPath, knownIds) {
  const text = readFileSync(absPath, "utf8");
  const head = text.split("\n").slice(0, 15).join("\n");
  const match = head.match(PROVENANCE_RE) || text.match(PROVENANCE_RE);
  if (!match) return { ok: false, reason: "missing provenance header" };
  const idMatch = text.match(/criterion:\s*@?(R-\d+\.\d+)/i);
  if (!idMatch) return { ok: false, reason: "missing criterion id" };
  const criterionId = idMatch[1];
  if (knownIds.size > 0 && !knownIds.has(criterionId)) {
    return { ok: false, reason: `unknown criterion ${criterionId}`, criterionId };
  }
  if (!PROVENANCE_RE.test(head)) {
    return { ok: true, criterionId, note: "provenance below line 15" };
  }
  return { ok: true, criterionId };
}

export function checkProvenance(root = ".", opts = {}) {
  const cfg = opts.config || loadConfig(root);
  const prefixes = cfg.provenance?.test_path_prefixes || [
    "tests/acceptance/",
    "tests/e2e/",
    "e2e/",
  ];
  const results = [];
  const files = [];

  for (const prefix of prefixes) {
    const abs = path.join(root, prefix);
    if (!existsSync(abs)) continue;
    for (const p of walk(abs)) {
      const rel = path.relative(root, p).replace(/\\/g, "/");
      if (isTestFile(rel)) files.push(rel);
    }
  }

  if (files.length === 0) {
    return { status: "skip", message: "no acceptance/e2e test files found", files: [], results };
  }

  const knownIds = loadCriterionIds(root);

  for (const rel of files) {
    const r = checkFile(path.join(root, rel), knownIds);
    results.push({ file: rel, ...r });
  }

  const missing = results.filter((r) => !r.ok);
  const unknown = results.filter((r) => r.reason?.startsWith("unknown criterion"));
  return {
    status: missing.length ? "warn" : "pass",
    message: missing.length
      ? `${missing.length} test file(s) missing or invalid criterion provenance${
          unknown.length ? ` (${unknown.length} unknown ID)` : ""
        }`
      : `${results.length} test file(s) declare criterion provenance`,
    files,
    results,
    missing: missing.map((m) => m.file),
  };
}

const __filename = fileURLToPath(import.meta.url);
const isMain = process.argv[1] && path.resolve(process.argv[1]) === __filename;

if (isMain) {
  const root = path.resolve(arg("root", "."));
  const out = checkProvenance(root);
  const mark = out.status === "pass" ? "PASS" : out.status === "skip" ? "SKIP" : "WARN";
  console.log(`[${mark}] provenance: ${out.message}`);
  for (const r of out.results.filter((x) => !x.ok)) {
    console.log(`  - ${r.file}${r.reason ? ` (${r.reason})` : ""}`);
  }
  if (process.env.GITHUB_STEP_SUMMARY && out.results.length) {
    const { appendFileSync } = await import("node:fs");
    const lines = [
      "### Provenance check",
      "",
      `**${mark}** — ${out.message}`,
      "",
      ...(out.missing?.length
        ? out.missing.map((f) => `- missing header: \`${f}\``)
        : ["- All scanned test files include `criterion: @R-xx.y` in the header."]),
    ];
    appendFileSync(process.env.GITHUB_STEP_SUMMARY, lines.join("\n") + "\n");
  }
  process.exit(0);
}
