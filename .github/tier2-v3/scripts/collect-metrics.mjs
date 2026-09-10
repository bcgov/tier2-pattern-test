#!/usr/bin/env node
/**
 * Collect Tier 2 v3 leading/lagging metrics from git history and GitHub PR exhaust.
 * No npm deps — uses git log and gh when available.
 */
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync, statSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { checkProvenance } from "./check-provenance.mjs";
import { buildCriteriaIndex, writeCriteriaIndex } from "./generate-criteria-index.mjs";

const CHECKPOINT_IDS = [
  "constitution_present",
  "constitution_platform_articles",
  "constitution_placeholders",
  "codeowners_present",
  "spec_present",
  "spec_structure",
  "spec_placeholders",
  "plan_present",
  "features_present",
];

function git(args, root) {
  try {
    return execFileSync("git", args, {
      cwd: root,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
    }).trim();
  } catch {
    return null;
  }
}

let ACTIVE_GH_REPO = null;

function resolveGhRepo(root) {
  const url = git(["remote", "get-url", "origin"], root);
  if (url) {
    const m = url.match(/github\.com[:/]([^/\s]+)\/([^/\s]+?)(?:\.git)?$/);
    if (m) return `${m[1]}/${m[2]}`;
  }
  return process.env.GITHUB_REPOSITORY || null;
}

function gh(args) {
  try {
    const next = [...args];
    if (ACTIVE_GH_REPO && !next.includes("--repo")) {
      next.push("--repo", ACTIVE_GH_REPO);
    }
    return execFileSync("gh", next, {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
      env: process.env,
    }).trim();
  } catch {
    return null;
  }
}

function daysBetween(a, b) {
  return Math.round((Date.parse(b) - Date.parse(a)) / 86400000);
}

function daysAgo(n) {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() - n);
  return d.toISOString();
}

function firstCommitDate(root, filePath) {
  if (!existsSync(path.join(root, filePath))) return null;
  const out = git(["log", "--reverse", "--format=%aI", "-1", "--", filePath], root);
  return out || null;
}

function resolveIntentPath(root) {
  if (existsSync(path.join(root, "intent"))) return "intent/";
  if (existsSync(path.join(root, "spec/intent.md"))) return "spec/intent.md";
  return null;
}

function commitCount(pr) {
  if (typeof pr.commitCount === "number") return pr.commitCount;
  if (Array.isArray(pr.commits)) return pr.commits.length;
  if (pr.commits && typeof pr.commits.totalCount === "number") return pr.commits.totalCount;
  return 1;
}

function mapCheckToTaxonomy(name) {
  const n = (name || "").toLowerCase();
  if (n.includes("checkpoint") || n.includes("checkpoints")) return "checkpoint_gate";
  if (n.includes("spec review") || n.includes("spec-review")) return "spec_review";
  if (n.includes("preflight")) return "preflight";
  for (const id of CHECKPOINT_IDS) {
    if (n.includes(id)) return id;
  }
  return name || "unknown";
}

function collectGateFailureTaxonomy() {
  const taxonomy = {};

  const runsRaw = gh([
    "run",
    "list",
    "--workflow",
    "tier2-v3-checkpoint-gate.yml",
    "--limit",
    "100",
    "--json",
    "conclusion,databaseId",
  ]);
  if (runsRaw) {
    try {
      const runs = JSON.parse(runsRaw).filter((r) => r.conclusion === "failure");
      for (const run of runs.slice(0, 25)) {
        const log = gh(["run", "view", String(run.databaseId), "--log"]);
        if (!log) {
          taxonomy.checkpoint_gate = (taxonomy.checkpoint_gate || 0) + 1;
          continue;
        }
        let matched = false;
        for (const id of CHECKPOINT_IDS) {
          if (log.includes(`[FAIL] ${id}:`)) {
            taxonomy[id] = (taxonomy[id] || 0) + 1;
            matched = true;
          }
        }
        if (!matched) taxonomy.checkpoint_gate = (taxonomy.checkpoint_gate || 0) + 1;
      }
    } catch {
      /* gh unavailable or parse error */
    }
  }

  const mergedRaw = gh([
    "pr",
    "list",
    "--state",
    "merged",
    "--limit",
    "30",
    "--json",
    "number",
  ]);
  if (mergedRaw) {
    try {
      const prs = JSON.parse(mergedRaw);
      for (const pr of prs) {
        const checksRaw = gh(["pr", "checks", String(pr.number), "--json", "name,state,bucket"]);
        if (!checksRaw) continue;
        let checks;
        try {
          checks = JSON.parse(checksRaw);
        } catch {
          continue;
        }
        const list = Array.isArray(checks) ? checks : Object.values(checks);
        for (const c of list) {
          const state = String(c.state || c.bucket || "").toLowerCase();
          if (state === "fail" || state === "failure") {
            const key = mapCheckToTaxonomy(c.name);
            taxonomy[key] = (taxonomy[key] || 0) + 1;
          }
        }
      }
    } catch {
      /* ignore */
    }
  }

  return taxonomy;
}

function applyTaxonomyExcludes(taxonomy, root) {
  const cfg = loadPackConfig(root);
  const excludes = cfg.metrics?.gate_taxonomy_exclude || [
    "activation",
    "agent",
  ];
  if (!excludes.length) return taxonomy;
  const out = { ...taxonomy };
  const excluded = {};
  for (const key of Object.keys(out)) {
    if (excludes.some((ex) => key.toLowerCase().includes(String(ex).toLowerCase()))) {
      excluded[key] = out[key];
      delete out[key];
    }
  }
  if (Object.keys(excluded).length) {
    out._excludedNoise = excluded;
  }
  return out;
}

function collectPrStats(planAt) {
  const stats = {
    planToFirstPrDays: null,
    firstPassMergeRate: null,
    reworkCyclesPerPr: null,
  };

  const mergedRaw = gh([
    "pr",
    "list",
    "--state",
    "merged",
    "--limit",
    "30",
    "--json",
    "number,createdAt,mergedAt,commits,commitCount",
  ]);
  if (!mergedRaw) return stats;

  let merged;
  try {
    merged = JSON.parse(mergedRaw);
  } catch {
    return stats;
  }
  if (!merged.length) return stats;

  const counts = merged.map((pr) => commitCount(pr));
  const firstPass = counts.filter((n) => n <= 1).length;
  stats.firstPassMergeRate = Math.round((firstPass / merged.length) * 1000) / 1000;
  const cycles = counts.map((n) => Math.max(0, n - 1));
  stats.reworkCyclesPerPr = Math.round((cycles.reduce((a, b) => a + b, 0) / cycles.length) * 100) / 100;

  if (planAt) {
    const allRaw = gh([
      "pr",
      "list",
      "--state",
      "all",
      "--limit",
      "30",
      "--json",
      "number,createdAt",
    ]);
    if (allRaw) {
      try {
        const all = JSON.parse(allRaw);
        if (all.length) {
          const firstPr = all.reduce((earliest, pr) =>
            !earliest || Date.parse(pr.createdAt) < Date.parse(earliest.createdAt) ? pr : earliest,
          );
          stats.planToFirstPrDays = daysBetween(planAt, firstPr.createdAt);
        }
      } catch {
        /* ignore */
      }
    }
  }

  return stats;
}

function resolveDefaultBranch(root) {
  const origin = git(["symbolic-ref", "refs/remotes/origin/HEAD"], root);
  if (origin) return origin.replace(/^refs\/remotes\/origin\//, "");
  const main = git(["rev-parse", "--verify", "main"], root);
  if (main) return "main";
  const master = git(["rev-parse", "--verify", "master"], root);
  if (master) return "master";
  return git(["branch", "--show-current"], root) || "main";
}

function fileOnBranch(root, branch, relPath) {
  if (!git(["rev-parse", "--verify", branch], root)) return false;
  return git(["cat-file", "-e", `${branch}:${relPath}`], root) !== null;
}

function prHumanCommentCount(prNumber) {
  const raw = gh(["pr", "view", String(prNumber), "--json", "comments"]);
  if (!raw) return null;
  try {
    const data = JSON.parse(raw);
    const comments = Array.isArray(data.comments) ? data.comments : [];
    return comments.filter((c) => {
      const author = c.author?.login || "";
      return author && !/\[bot\]$/i.test(author) && author !== "github-actions";
    }).length;
  } catch {
    return null;
  }
}

const CRITERION_RE = /@R-(\d+\.\d+)/g;

function listFeatureBodies(root) {
  const dir = path.join(root, "spec/features");
  if (!existsSync(dir)) return [];
  return readdirSync(dir)
    .filter((f) => f.endsWith(".feature"))
    .map((f) => ({
      file: `spec/features/${f}`,
      body: readFileSync(path.join(dir, f), "utf8"),
    }));
}

function walkImpl(root, prefixes) {
  const files = [];
  for (const prefix of prefixes) {
    const abs = path.join(root, prefix.replace(/\/$/, ""));
    if (!existsSync(abs)) continue;
    const stack = [abs];
    while (stack.length) {
      const cur = stack.pop();
      for (const name of readdirSync(cur)) {
        if (name === "node_modules" || name === ".git") continue;
        const p = path.join(cur, name);
        if (statSync(p).isDirectory()) stack.push(p);
        else files.push(path.relative(root, p).replace(/\\/g, "/"));
      }
    }
  }
  return files;
}

function loadCriteriaIndex(root) {
  const p = path.join(root, "spec/criteria-index.json");
  if (existsSync(p)) {
    try {
      return JSON.parse(readFileSync(p, "utf8"));
    } catch {
      /* regenerate below */
    }
  }
  return buildCriteriaIndex(root);
}

function deriveCoverageStates(root) {
  const index = loadCriteriaIndex(root);
  const criteria = index.criteria || [];
  const ids = [...new Set(criteria.map((c) => c.id))];

  const defaultBranch = resolveDefaultBranch(root);
  const prov = checkProvenance(root);
  const verifiedIds = new Set();
  for (const r of prov.results || []) {
    if (!r.ok || !r.criterionId) continue;
    verifiedIds.add(r.criterionId);
  }

  // Implemented = referenced from tasks.md or pr-evidence (not full src scrape)
  let tasksText = "";
  let evidenceText = "";
  try {
    if (existsSync(path.join(root, "spec/tasks.md"))) {
      tasksText = readFileSync(path.join(root, "spec/tasks.md"), "utf8");
    }
    if (existsSync(path.join(root, "docs/pr-evidence.md"))) {
      evidenceText = readFileSync(path.join(root, "docs/pr-evidence.md"), "utf8");
    }
  } catch {
    /* ignore */
  }
  const implHints = `${tasksText}\n${evidenceText}`;

  const coverage = {};
  for (const id of ids) {
    const entries = criteria.filter((c) => c.id === id);
    let state = "specified";
    if (
      entries.some((e) => fileOnBranch(root, defaultBranch, e.feature)) ||
      (!isGitRepo(root) && entries.length > 0)
    ) {
      state = "accepted";
    }
    if (implHints.includes(`@${id}`) || implHints.includes(id)) state = "implemented";
    if (verifiedIds.has(id)) state = "verified";
    coverage[id] = state;
  }
  return coverage;
}

function collectCiFailureSeries() {
  const since = daysAgo(30);
  const runsRaw = gh([
    "run",
    "list",
    "--limit",
    "500",
    "--json",
    "conclusion,createdAt,workflowName",
  ]);
  if (!runsRaw) return { current: null, series: [], evidence: { error: "gh unavailable" } };

  let runs;
  try {
    runs = JSON.parse(runsRaw);
  } catch {
    return { current: null, series: [], evidence: { error: "parse error" } };
  }

  const recent = runs.filter((r) => r.createdAt >= since);
  if (!recent.length) {
    return { current: null, series: [], evidence: { totalRuns: 0 } };
  }

  const byDay = new Map();
  for (const run of recent) {
    const day = run.createdAt.slice(0, 10);
    if (!byDay.has(day)) byDay.set(day, { total: 0, failed: 0 });
    const bucket = byDay.get(day);
    bucket.total += 1;
    if (run.conclusion === "failure") bucket.failed += 1;
  }

  const series = [...byDay.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([, v]) => (v.total ? v.failed / v.total : 0));

  return {
    current: series.length ? series[series.length - 1] : null,
    series,
    evidence: {
      totalRuns: recent.length,
      days: series.length,
      recentFailures: recent
        .filter((r) => r.conclusion === "failure")
        .slice(0, 5)
        .map((r) => ({ workflow: r.workflowName, at: r.createdAt })),
    },
  };
}

function collectCheckpointGatePassRate() {
  const runsRaw = gh([
    "run",
    "list",
    "--workflow",
    "tier2-v3-checkpoint-gate.yml",
    "--limit",
    "50",
    "--json",
    "conclusion",
  ]);
  if (!runsRaw) return null;
  try {
    const runs = JSON.parse(runsRaw).filter((r) => r.conclusion === "success" || r.conclusion === "failure");
    if (!runs.length) return null;
    const ok = runs.filter((r) => r.conclusion === "success").length;
    return Math.round((ok / runs.length) * 1000) / 1000;
  } catch {
    return null;
  }
}

function isGitRepo(root) {
  return existsSync(path.join(root, ".git"));
}

function loadPackConfig(root) {
  const p = path.join(root, "tier2-v3.config.json");
  if (!existsSync(p)) return {};
  try {
    return JSON.parse(readFileSync(p, "utf8"));
  } catch {
    return {};
  }
}

function countCriterionIdCoverage(root) {
  const dir = path.join(root, "spec/features");
  if (!existsSync(dir)) {
    return { scenarioCount: 0, taggedCount: 0, coverageRate: null, missingScenarios: [] };
  }

  let scenarioCount = 0;
  let taggedCount = 0;
  const missingScenarios = [];

  for (const file of readdirSync(dir).filter((f) => f.endsWith(".feature"))) {
    const body = readFileSync(path.join(dir, file), "utf8");
    const lines = body.split("\n");
    for (let i = 0; i < lines.length; i++) {
      if (!/^\s*Scenario(?: Outline)?:/.test(lines[i])) continue;
      scenarioCount += 1;
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
      if (hasId) taggedCount += 1;
      else missingScenarios.push(`${file}: ${lines[i].trim()}`);
    }
  }

  return {
    scenarioCount,
    taggedCount,
    coverageRate:
      scenarioCount > 0 ? Math.round((taggedCount / scenarioCount) * 1000) / 1000 : null,
    missingScenarios: missingScenarios.slice(0, 10),
  };
}

function firstCriterionCommitDate(root, criterionId) {
  const tag = `@${criterionId}`;
  const out = git(["log", "--reverse", "--format=%aI", "-1", "-S", tag, "--", "spec/features"], root);
  return out || null;
}

function summarizeCoverageStates(root, coverageStates, stallDays) {
  const stateCounts = { specified: 0, accepted: 0, implemented: 0, verified: 0 };
  const stalled = [];
  const orphans = [];

  for (const [id, state] of Object.entries(coverageStates)) {
    stateCounts[state] = (stateCounts[state] || 0) + 1;
    if (state === "specified" || state === "accepted") {
      const firstAt = firstCriterionCommitDate(root, id);
      if (firstAt) {
        const age = daysBetween(firstAt, new Date().toISOString());
        if (age >= stallDays) {
          stalled.push({ id, state, daysSinceSpecified: age });
        }
      }
      orphans.push(id);
    }
  }

  stalled.sort((a, b) => b.daysSinceSpecified - a.daysSinceSpecified);
  return {
    stateCounts,
    stalledCriteria: stalled.slice(0, 20),
    orphanCriteria: orphans.slice(0, 20),
    stallThresholdDays: stallDays,
  };
}

function prTouchesImpl(files, prefixes) {
  return (files || []).some((f) => {
    const p = typeof f === "string" ? f : f.path;
    return prefixes.some((prefix) => p.startsWith(prefix));
  });
}

function hasSpecTrace(body) {
  return /spec\/|features\/|#\d+|TASK-|@R-\d+\.\d+/i.test(body);
}

function extractFindingId(prTitle) {
  const m = (prTitle || "").match(/\[RA\s+([A-Z]+-\d+)\]/i);
  return m ? m[1].toUpperCase() : null;
}

function evidenceSectionForPr(evidenceText, prTitle) {
  const finding = extractFindingId(prTitle);
  if (!finding || !evidenceText) return evidenceText || "";
  const escaped = finding.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const re = new RegExp(
    `# PR evidence — \\[RA ${escaped}\\][\\s\\S]*?(?=\\n# PR evidence —|$)`,
    "i",
  );
  const m = evidenceText.match(re);
  return m ? m[0] : evidenceText;
}

function loadLocalPrEvidence(root) {
  const evidencePath = path.join(root, "docs/pr-evidence.md");
  if (!existsSync(evidencePath)) return "";
  try {
    return readFileSync(evidencePath, "utf8");
  } catch {
    return "";
  }
}

function fetchPrEvidenceAtMerge(root, prNumber) {
  const raw = gh([
    "pr",
    "view",
    String(prNumber),
    "--json",
    "mergeCommit",
  ]);
  if (!raw) return "";
  let mergeOid;
  try {
    mergeOid = JSON.parse(raw).mergeCommit?.oid;
  } catch {
    return "";
  }
  if (!mergeOid) return "";
  return git(["show", `${mergeOid}:docs/pr-evidence.md`], root) || "";
}

function hasReviewReceipt(text) {
  const body = text || "";
  const hasSection = /##\s*review receipt/i.test(body);
  const hasChecked = /\*\*checked\*\*|^checked:/im.test(body);
  const hasCouldNot =
    /\*\*could not check\*\*|could not check|couldn't check/i.test(body);
  if (hasSection && hasChecked && hasCouldNot) return true;

  // Legacy Human checkpoint 3 (pre-unify template) — still accepted for historical PRs
  if (/##\s*human checkpoint\s*3/i.test(body)) {
    if (/reviewer confirms.*ready to merge/i.test(body)) return true;
    if (/simulated checkpoint|checkpoint\s*3.*approv/i.test(body)) return true;
  }

  return false;
}

/** Extract finding id from PR title: [RA AUTH-001], AUTH-001, fix: LOG-002, etc. */
function findingIdFromTitle(title) {
  const t = title || "";
  const ra = t.match(/\[?\s*RA\s+([A-Z]+-\d+)\s*\]?/i);
  if (ra) return ra[1].toUpperCase();
  const bare = t.match(/\b([A-Z]{2,10}-\d{3})\b/);
  return bare ? bare[1].toUpperCase() : null;
}

function collectImplPrTraceability(root) {
  const cfg = loadPackConfig(root);
  const prefixes =
    cfg.spec_review?.paths || cfg.checkpoints?.impl_path_prefixes || ["src/"];

  const out = {
    implPrsSampled: 0,
    specTraceMissRate: null,
    reviewReceiptMissRate: null,
    specTraceMissCount: 0,
    reviewReceiptMissCount: 0,
  };

  const mergedRaw = gh([
    "pr",
    "list",
    "--state",
    "merged",
    "--limit",
    "30",
    "--json",
    "number,title,body",
  ]);
  if (!mergedRaw) return out;

  let prs;
  try {
    prs = JSON.parse(mergedRaw);
  } catch {
    return out;
  }

  for (const pr of prs) {
    const filesRaw = gh(["pr", "view", String(pr.number), "--json", "files"]);
    if (!filesRaw) continue;
    let files;
    try {
      files = JSON.parse(filesRaw).files || [];
    } catch {
      continue;
    }
    if (!prTouchesImpl(files, prefixes)) continue;

    out.implPrsSampled += 1;
    let body = `${pr.title || ""}\n${pr.body || ""}`;
    // Always load merge-time evidence for impl PRs (title/diff heuristics caused false
    // receipt misses when titles were "fix: VULN-003" without touching pr-evidence in the diff).
    const mergeEvidence = fetchPrEvidenceAtMerge(root, pr.number);
    const localEvidence = loadLocalPrEvidence(root);
    const evidence = mergeEvidence || localEvidence;
    const finding = findingIdFromTitle(pr.title);
    const sectionTitle = finding ? `[RA ${finding}]` : pr.title;
    if (evidence) {
      body += `\n${evidenceSectionForPr(evidence, sectionTitle)}`;
    }
    if (!hasSpecTrace(body)) out.specTraceMissCount += 1;
    if (!hasReviewReceipt(body)) out.reviewReceiptMissCount += 1;
  }

  if (out.implPrsSampled > 0) {
    out.specTraceMissRate =
      Math.round((out.specTraceMissCount / out.implPrsSampled) * 1000) / 1000;
    out.reviewReceiptMissRate =
      Math.round((out.reviewReceiptMissCount / out.implPrsSampled) * 1000) / 1000;
  }

  return out;
}

export function collectTraceabilityQuality(root) {
  const cfg = loadPackConfig(root);
  const stallDays = cfg.metrics?.traceability?.stall_days ?? 14;

  const criterionIds = countCriterionIdCoverage(root);
  const provenance = checkProvenance(root);
  const provTotal = provenance.results?.length || 0;
  const provOk = (provenance.results || []).filter((r) => r.ok).length;
  const provInvalid = (provenance.results || []).filter((r) => !r.ok);

  let coverageStates = {};
  try {
    coverageStates = deriveCoverageStates(root);
  } catch {
    coverageStates = {};
  }

  const coverageSummary = summarizeCoverageStates(root, coverageStates, stallDays);

  const implPr = collectImplPrTraceability(root);

  return {
    criterionIdCoverage: criterionIds,
    provenanceCoverage: {
      testFileCount: provTotal,
      validCount: provOk,
      coverageRate: provTotal > 0 ? Math.round((provOk / provTotal) * 1000) / 1000 : null,
      invalidFiles: provInvalid.map((r) => ({
        file: r.file,
        reason: r.reason || "missing provenance",
      })).slice(0, 10),
      skipped: provenance.status === "skip",
    },
    coverageSummary,
    implPrTraceability: implPr,
  };
}

function collectCostOfJudgment() {
  const out = {
    reviewTurnsPerCheckpointPr: null,
    medianDaysAtCheckpoint: null,
  };

  const prsRaw = gh([
    "pr",
    "list",
    "--state",
    "all",
    "--limit",
    "50",
    "--json",
    "number,title,createdAt,mergedAt,labels,comments",
  ]);
  if (!prsRaw) return out;

  let prs;
  try {
    prs = JSON.parse(prsRaw);
  } catch {
    return out;
  }

  const checkpointPrs = prs.filter((pr) => {
    const title = (pr.title || "").toLowerCase();
    const labels = (pr.labels || []).map((l) => (typeof l === "string" ? l : l.name).toLowerCase());
    const isCheckpointLabel = labels.some(
      (l) =>
        l.includes("checkpoint") ||
        l === "docs(spec)" ||
        l === "docs(plan)" ||
        l.startsWith("intent/"),
    );
    const isIntentPr = /^intent[:\/]/i.test(pr.title || "") || title.startsWith("intent:");
    const isSpecPlanPr =
      (title.includes("spec") || title.includes("plan")) &&
      !title.includes("implement") &&
      labels.some((l) => l.includes("spec") || l.includes("plan"));
    return isCheckpointLabel || isIntentPr || isSpecPlanPr;
  });

  if (!checkpointPrs.length) return out;

  const turns = checkpointPrs
    .map((pr) => prHumanCommentCount(pr.number))
    .filter((n) => typeof n === "number");

  if (turns.length) {
    out.reviewTurnsPerCheckpointPr =
      Math.round((turns.reduce((a, b) => a + b, 0) / turns.length) * 100) / 100;
  }

  const dwell = checkpointPrs
    .filter((pr) => pr.mergedAt && pr.createdAt)
    .map((pr) => daysBetween(pr.createdAt, pr.mergedAt));
  if (dwell.length) {
    dwell.sort((a, b) => a - b);
    out.medianDaysAtCheckpoint = dwell[Math.floor(dwell.length / 2)];
  }

  return out;
}

export function collectMetrics(root = process.cwd()) {
  ACTIVE_GH_REPO = resolveGhRepo(root);
  const report = {
    generatedAt: new Date().toISOString(),
    intentToSpecDays: null,
    specToPlanDays: null,
    planToFirstPrDays: null,
    firstPassMergeRate: null,
    gateFailureTaxonomy: {},
    reworkCyclesPerPr: null,
    coverageStates: {},
    costOfJudgment: {
      reviewTurnsPerCheckpointPr: null,
      medianDaysAtCheckpoint: null,
    },
    traceabilityQuality: null,
    maintainSignals: {
      ci_test_failure_rate: null,
      checkpointGatePassRate: null,
    },
  };

  // Refresh criteria index so coverage + structural checks share one source
  try {
    writeCriteriaIndex(root);
  } catch {
    /* non-fatal */
  }

  const specAt = firstCommitDate(root, "spec/spec.md");
  const planAt = firstCommitDate(root, "spec/plan.md");
  const intentPath = resolveIntentPath(root);
  const intentAt = intentPath ? firstCommitDate(root, intentPath) : null;

  if (intentAt && specAt) report.intentToSpecDays = daysBetween(intentAt, specAt);
  if (specAt && planAt) report.specToPlanDays = daysBetween(specAt, planAt);

  try {
    report.coverageStates = deriveCoverageStates(root);
  } catch {
    report.coverageStates = {};
  }

  try {
    report.traceabilityQuality = collectTraceabilityQuality(root);
  } catch {
    report.traceabilityQuality = null;
  }

  try {
    const prStats = collectPrStats(planAt);
    report.planToFirstPrDays = prStats.planToFirstPrDays;
    report.firstPassMergeRate = prStats.firstPassMergeRate;
    report.reworkCyclesPerPr = prStats.reworkCyclesPerPr;
    report.gateFailureTaxonomy = applyTaxonomyExcludes(collectGateFailureTaxonomy(), root);
    report.costOfJudgment = collectCostOfJudgment();
    report.maintainSignals.ci_test_failure_rate = collectCiFailureSeries();
    report.maintainSignals.checkpointGatePassRate = collectCheckpointGatePassRate();
  } catch {
    /* gh unavailable — git-only metrics still returned */
  }

  return report;
}

function loadArtifactPath(root) {
  const cfgPath = path.join(root, "tier2-v3.config.json");
  if (!existsSync(cfgPath)) return "docs/tier2-v3-metrics.json";
  try {
    const cfg = JSON.parse(readFileSync(cfgPath, "utf8"));
    return cfg.metrics?.artifact_path || "docs/tier2-v3-metrics.json";
  } catch {
    return "docs/tier2-v3-metrics.json";
  }
}

function arg(name) {
  const i = process.argv.indexOf(`--${name}`);
  return i === -1 ? undefined : process.argv[i + 1];
}

const __filename = fileURLToPath(import.meta.url);
const isMain = process.argv[1] && path.resolve(process.argv[1]) === __filename;

if (isMain) {
  const root = path.resolve(arg("root") || process.cwd());
  const report = collectMetrics(root);
  const relOut = loadArtifactPath(root);
  const outPath = path.join(root, relOut);
  mkdirSync(path.dirname(outPath), { recursive: true });
  writeFileSync(outPath, `${JSON.stringify(report, null, 2)}\n`);
  console.log(`Wrote ${outPath}`);
  console.log(JSON.stringify(report, null, 2));
}
