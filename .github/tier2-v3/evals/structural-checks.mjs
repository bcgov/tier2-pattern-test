#!/usr/bin/env node
/**
 * Structural harness tests — deterministic checks on harness artifacts.
 * Unlike --simulate agent evals, these assert constitution / REVIEW / AGENTS shape.
 *
 * Usage:
 *   node structural-checks.mjs --root .
 */
import { existsSync, readFileSync, readdirSync, appendFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

function arg(name, fallback) {
  const i = process.argv.indexOf(`--${name}`);
  if (i === -1) return fallback;
  return process.argv[i + 1] ?? fallback;
}

function findConstitution(root) {
  for (const c of [
    "constitution.md",
    ".specify/memory/constitution.md",
    "spec/constitution.md",
    "bundle/constitution.md",
    "bundle/.specify/memory/constitution.md",
  ]) {
    if (existsSync(path.join(root, c))) return c;
  }
  return null;
}

function findAgents(root) {
  for (const c of ["AGENTS.md", "bundle/AGENTS.md", ".github/tier2-v3/bundle/AGENTS.md"]) {
    if (existsSync(path.join(root, c))) return c;
  }
  return null;
}

function findReview(root) {
  for (const c of ["REVIEW.md", "bundle/REVIEW.md", ".github/tier2-v3/bundle/REVIEW.md"]) {
    if (existsSync(path.join(root, c))) return c;
  }
  return null;
}

export function runStructuralChecks(root = ".") {
  const results = [];
  const pass = (id, message) => results.push({ id, status: "pass", message });
  const fail = (id, message) => results.push({ id, status: "fail", message });

  const constitutionRel = findConstitution(root);
  if (!constitutionRel) {
    fail("constitution_present", "No constitution.md found");
  } else {
    pass("constitution_present", `Found ${constitutionRel}`);
    const body = readFileSync(path.join(root, constitutionRel), "utf8");
    const missing = ["P1", "P2", "P3", "P4", "P5", "P6", "P7", "P8"].filter(
      (p) => !body.includes(`### ${p}`) && !body.includes(`## ${p}`),
    );
    if (missing.length) {
      fail("constitution_articles", `Missing platform articles: ${missing.join(", ")}`);
    } else {
      pass("constitution_articles", "Platform articles P1–P8 present");
    }
  }

  const reviewRel = findReview(root);
  if (!reviewRel) {
    fail("review_policy", "REVIEW.md missing");
  } else {
    const body = readFileSync(path.join(root, reviewRel), "utf8");
    if (!/##\s*Review receipt/i.test(body)) {
      fail("review_receipt_section", "REVIEW.md missing ## Review receipt section");
    } else {
      pass("review_receipt_section", "REVIEW.md has review receipt section");
    }
    const hasChecked = /checked/i.test(body);
    const hasCouldNot = /could not check/i.test(body);
    if (!hasChecked || !hasCouldNot) {
      fail(
        "review_receipt_fields",
        "REVIEW.md receipt must mention Checked and Could not check",
      );
    } else {
      pass("review_receipt_fields", "REVIEW.md receipt fields present");
    }
  }

  const agentsRel = findAgents(root);
  if (!agentsRel) {
    fail("agents_present", "AGENTS.md missing");
  } else {
    const body = readFileSync(path.join(root, agentsRel), "utf8");
    const forbidsMerge =
      /must not self-merge|never self-merge|do not merge|MUST NOT self-merge|no agent self-merge|human.*merge|checkpoint 3/i.test(
        body,
      );
    if (!forbidsMerge) {
      fail(
        "agents_no_self_merge",
        "AGENTS.md should forbid agent self-merge / require human merge",
      );
    } else {
      pass("agents_no_self_merge", "AGENTS.md forbids self-merge / requires human ship");
    }
  }

  const featureDirCandidates = [
    path.join(root, "spec/features"),
    path.join(root, "bundle/spec/features"),
  ];
  let featureDir = null;
  for (const d of featureDirCandidates) {
    if (existsSync(d)) {
      featureDir = d;
      break;
    }
  }
  if (featureDir) {
    const features = readdirSync(featureDir).filter((f) => f.endsWith(".feature"));
    if (features.length === 0) {
      fail("features_scaffold", "spec/features/ exists but has no .feature files");
    } else {
      pass("features_scaffold", `${features.length} feature file(s)`);
      let anyId = false;
      for (const f of features) {
        if (/@R-\d+\.\d+/.test(readFileSync(path.join(featureDir, f), "utf8"))) {
          anyId = true;
          break;
        }
      }
      if (!anyId) {
        fail("criterion_id_convention", "No @R-xx.y tags found in feature files");
      } else {
        pass("criterion_id_convention", "At least one @R-xx.y criterion ID present");
      }
    }
  } else {
    fail("features_scaffold", "spec/features/ missing");
  }

  const indexCandidates = [
    path.join(root, "spec/criteria-index.json"),
    path.join(root, "bundle/spec/criteria-index.json"),
  ];
  let indexPath = indexCandidates.find((p) => existsSync(p));
  if (indexPath) {
    try {
      const idx = JSON.parse(readFileSync(indexPath, "utf8"));
      if (!Array.isArray(idx.criteria)) {
        fail("criteria_index", "criteria-index.json missing criteria array");
      } else {
        pass("criteria_index", `${idx.criteria.length} criteria in index`);
      }
    } catch (e) {
      fail("criteria_index", `criteria-index.json parse error: ${e.message}`);
    }
  } else {
    pass("criteria_index", "spec/criteria-index.json not present yet (run generate-criteria-index)");
  }

  return results;
}

const __filename = fileURLToPath(import.meta.url);
const isMain = process.argv[1] && path.resolve(process.argv[1]) === __filename;

if (isMain) {
  const root = path.resolve(arg("root", "."));
  const results = runStructuralChecks(root);
  const failed = results.filter((r) => r.status === "fail");
  console.log(`Structural harness checks — root=${root}\n`);
  for (const r of results) {
    console.log(`[${r.status === "pass" ? "PASS" : "FAIL"}] ${r.id}: ${r.message}`);
  }
  console.log(`\nSummary: ${results.length - failed.length} pass, ${failed.length} fail`);
  if (process.env.GITHUB_STEP_SUMMARY) {
    appendFileSync(
      process.env.GITHUB_STEP_SUMMARY,
      [
        "### Structural harness checks",
        "",
        "| Status | Check | Message |",
        "| --- | --- | --- |",
        ...results.map((r) => `| ${r.status} | ${r.id} | ${r.message.replace(/\|/g, "\\|")} |`),
        "",
      ].join("\n"),
    );
  }
  process.exit(failed.length ? 1 : 0);
}
