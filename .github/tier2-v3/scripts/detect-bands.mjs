#!/usr/bin/env node
/**
 * σ-band detection → maintain intent queue (Tier 2 v3 Stage 6).
 * Loads maintain/bands.json; prefers weekly metrics artifact for series data;
 * falls back to gh. Primary band: ci_test_failure_rate.
 *
 * CLI: --dry-run, --root, --metrics <path>
 */
import { execFileSync } from "node:child_process";
import {
  existsSync,
  mkdirSync,
  readFileSync,
  writeFileSync,
} from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const METRIC_COLLECTORS = {
  ci_test_failure_rate: collectCiTestFailureRate,
};

function arg(name) {
  const i = process.argv.indexOf(`--${name}`);
  return i === -1 ? undefined : process.argv[i + 1];
}

function hasFlag(name) {
  return process.argv.includes(`--${name}`);
}

function hasGh() {
  try {
    execFileSync("gh", ["--version"], { stdio: "ignore" });
    return true;
  } catch {
    return false;
  }
}

function gh(args) {
  return execFileSync("gh", args, {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
    env: process.env,
  }).trim();
}

function ghJson(args) {
  try {
    const raw = gh(args);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function mean(values) {
  if (!values.length) return 0;
  return values.reduce((a, b) => a + b, 0) / values.length;
}

function stdev(values) {
  if (values.length < 2) return 0;
  const m = mean(values);
  const variance =
    values.reduce((acc, v) => acc + (v - m) ** 2, 0) / (values.length - 1);
  return Math.sqrt(variance);
}

function isoDay(iso) {
  return iso.slice(0, 10);
}

function daysAgo(n) {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() - n);
  return d.toISOString();
}

function zScore(current, mu, sigma) {
  if (sigma === 0) return current > mu ? Infinity : 0;
  return (current - mu) / sigma;
}

function sigmaTier(z, rules) {
  if (rules !== "western_electric") {
    /* fallback: simple z thresholds */
  }
  const abs = Math.abs(z);
  if (abs >= 3) return "3sigma";
  if (abs >= 2) return "2sigma";
  if (abs >= 1) return "1sigma";
  return null;
}

function parseSimpleYamlBlock(text) {
  const doc = {};
  let currentKey = null;
  let tiers = null;

  for (const line of text.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;

    const top = trimmed.match(/^([a-z_]+):\s*(.*)$/i);
    if (top && !line.startsWith("  ")) {
      currentKey = top[1];
      const rest = top[2].trim();
      if (currentKey === "tiers") {
        tiers = {};
        doc.tiers = tiers;
        continue;
      }
      if (rest.startsWith("{")) {
        doc[currentKey] = parseInlineYaml(rest);
      } else if (rest) {
        doc[currentKey] = rest.replace(/^["']|["']$/g, "");
      } else {
        doc[currentKey] = null;
      }
      continue;
    }

    const tierLine = trimmed.match(/^(\d+sigma):\s*(.+)$/i);
    if (tierLine && tiers) {
      tiers[tierLine[1]] = parseInlineYaml(tierLine[2]);
      continue;
    }

    const nested = trimmed.match(/^([a-z_]+):\s*(.+)$/i);
    if (nested && currentKey === "tiers" && tiers) {
      tiers[nested[1]] = parseInlineYaml(nested[2]);
    }
  }

  return doc;
}

function parseInlineYaml(raw) {
  const inner = raw.replace(/^\{|\}$/g, "").trim();
  const obj = {};
  if (!inner) return obj;
  for (const part of inner.split(",")) {
    const m = part.trim().match(/^([a-z_]+):\s*(.+)$/i);
    if (!m) continue;
    let val = m[2].trim().replace(/^["']|["']$/g, "");
    if (val.startsWith("[") && val.endsWith("]")) {
      obj[m[1]] = val
        .slice(1, -1)
        .split(",")
        .map((s) => s.trim().replace(/^["']|["']$/g, ""))
        .filter(Boolean);
    } else {
      obj[m[1]] = val;
    }
  }
  return obj;
}

export function loadBandsConfig(root) {
  const candidates = [
    path.join(root, "maintain", "bands.json"),
    path.join(root, ".github", "tier2-v3", "maintain", "bands.json"),
    fileURLToPath(new URL("../bundle/maintain/bands.json", import.meta.url)),
  ];

  for (const p of candidates) {
    if (!existsSync(p)) continue;
    const raw = JSON.parse(readFileSync(p, "utf8"));
    const metrics = Array.isArray(raw.metrics) ? raw.metrics : Array.isArray(raw) ? raw : [];
    if (!metrics.length) continue;
    return { path: p, metrics };
  }

  throw new Error(
    "Missing bands.json — expected maintain/bands.json in repo root",
  );
}

function loadMetricsArtifact(root, explicitPath) {
  const candidates = [
    explicitPath,
    process.env.METRICS_ARTIFACT_PATH,
    path.join(root, "docs/tier2-v3-metrics.json"),
    path.join(root, "tier2-v3-metrics.json"),
  ].filter(Boolean);

  for (const p of candidates) {
    const abs = path.isAbsolute(p) ? p : path.join(root, p);
    if (!existsSync(abs)) continue;
    try {
      return { path: abs, data: JSON.parse(readFileSync(abs, "utf8")) };
    } catch {
      /* try next */
    }
  }
  return null;
}

function sampleFromArtifact(artifact, metricName) {
  if (!artifact?.data) return null;
  const signal = artifact.data.maintainSignals?.[metricName];
  if (signal && (Array.isArray(signal.series) || signal.current != null)) {
    return {
      current: signal.current ?? null,
      series: signal.series || [],
      evidence: {
        ...(signal.evidence || {}),
        source: "metrics_artifact",
        artifactPath: artifact.path,
      },
    };
  }
  return null;
}

function collectCiTestFailureRate(opts = {}) {
  const fromArtifact = sampleFromArtifact(opts.artifact, "ci_test_failure_rate");
  if (fromArtifact && fromArtifact.series.length) return fromArtifact;
  const since = daysAgo(30);
  const runs =
    ghJson([
      "run",
      "list",
      "--limit",
      "500",
      "--json",
      "conclusion,createdAt,workflowName",
    ]) || [];

  const recent = runs.filter((r) => r.createdAt >= since);
  if (!recent.length) {
    return { current: null, series: [], evidence: { totalRuns: 0 } };
  }

  const byDay = new Map();
  for (const run of recent) {
    const day = isoDay(run.createdAt);
    if (!byDay.has(day)) byDay.set(day, { total: 0, failed: 0 });
    const bucket = byDay.get(day);
    bucket.total += 1;
    if (run.conclusion === "failure") bucket.failed += 1;
  }

  const series = [...byDay.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([, v]) => (v.total ? v.failed / v.total : 0));

  const current = series.length ? series[series.length - 1] : null;
  const failedRuns = recent
    .filter((r) => r.conclusion === "failure")
    .slice(0, 5);

  return {
    current,
    series,
    evidence: {
      totalRuns: recent.length,
      days: series.length,
      recentFailures: failedRuns.map((r) => ({
        workflow: r.workflowName,
        at: r.createdAt,
      })),
    },
  };
}

function collectPrCycleTimeDays() {
  const since = daysAgo(60);
  const prs =
    ghJson([
      "pr",
      "list",
      "--state",
      "merged",
      "--limit",
      "100",
      "--json",
      "number,createdAt,mergedAt",
    ]) || [];

  const samples = prs
    .filter((pr) => pr.mergedAt && pr.createdAt && pr.mergedAt >= since)
    .map((pr) => ({
      number: pr.number,
      days: Math.round(
        (Date.parse(pr.mergedAt) - Date.parse(pr.createdAt)) / 86400000,
      ),
      mergedAt: pr.mergedAt,
    }))
    .filter((s) => s.days >= 0);

  if (!samples.length) {
    return { current: null, series: [], evidence: { mergedPrs: 0 } };
  }

  const cutoff = daysAgo(30);
  const baselineSamples = samples.filter((s) => s.mergedAt >= cutoff);
  const series = baselineSamples.map((s) => s.days);

  const recentCutoff = daysAgo(7);
  const recent = samples.filter((s) => s.mergedAt >= recentCutoff);
  const current = recent.length
    ? mean(recent.map((s) => s.days))
    : series[series.length - 1];

  return {
    current,
    series,
    evidence: {
      mergedPrs: samples.length,
      recentPrs: recent.map((s) => ({ number: s.number, days: s.days })),
    },
  };
}

function collectMetric(metricName, opts = {}) {
  const collector = METRIC_COLLECTORS[metricName];
  if (!collector) {
    return { current: null, series: [], evidence: { error: "unknown metric" } };
  }
  try {
    const fromArtifact = sampleFromArtifact(opts.artifact, metricName);
    if (fromArtifact && fromArtifact.series?.length) return fromArtifact;
    if (!hasGh()) {
      return {
        current: null,
        series: [],
        evidence: { error: "gh unavailable and no metrics artifact series" },
      };
    }
    return collector(opts);
  } catch (err) {
    return {
      current: null,
      series: [],
      evidence: { error: err.message || String(err) },
    };
  }
}

function diagnoseCiFailures(evidence, tools) {
  const lines = [
    "### σ-band diagnose — ci_test_failure_rate",
    "",
    `Tools hint: ${tools || "Read,Grep,Bash(gh run view *)"}`,
    "",
  ];

  const failures = evidence.recentFailures || [];
  if (!failures.length) {
    lines.push("No recent failed runs found in the 30-day window.");
    return lines.join("\n");
  }

  if (!hasGh()) {
    lines.push("Recent failures (gh unavailable for log fetch):");
    for (const f of failures) {
      lines.push(`- ${f.workflow} @ ${f.at}`);
    }
    return lines.join("\n");
  }

  const runList =
    ghJson([
      "run",
      "list",
      "--limit",
      "10",
      "--json",
      "conclusion,databaseId,workflowName,createdAt,url",
    ]) || [];
  const failed = runList.filter((r) => r.conclusion === "failure").slice(0, 3);

  for (const run of failed) {
    lines.push(`#### ${run.workflowName} (${run.createdAt})`);
    lines.push(`Run: ${run.url || run.databaseId}`);
    try {
      const log = gh(["run", "view", String(run.databaseId), "--log-failed"]);
      const excerpt = (log || "").split("\n").slice(-20).join("\n");
      lines.push("```");
      lines.push(excerpt.slice(-2000) || "(empty failed log)");
      lines.push("```");
    } catch {
      lines.push("_Could not fetch failed log excerpt._");
    }
    lines.push("");
  }

  return lines.join("\n");
}

function diagnosePrCycle(evidence) {
  const lines = [
    "### σ-band diagnose — pr_cycle_time_days",
    "",
    "Recent merged PR cycle times (days):",
  ];
  const recent = evidence.recentPrs || [];
  if (!recent.length) {
    lines.push("- No merged PRs in the last 7 days.");
  } else {
    for (const pr of recent) {
      lines.push(`- PR #${pr.number}: ${pr.days} days`);
    }
  }
  return lines.join("\n");
}

function renderMaintainIntent({ metric, current, mu, sigma, z, tier, date }) {
  const pct = (n) => (typeof n === "number" ? n.toFixed(4) : "n/a");
  const problem = [
    `Maintain loop detected a ${tier} breach on **${metric}**.`,
    `Current value: **${pct(current)}** (30-day baseline mean ${pct(mu)}, σ=${pct(sigma)}, z=${pct(z)}).`,
  ].join(" ");

  const outcome =
    metric === "ci_test_failure_rate"
      ? `Restore CI test failure rate to within 1σ of the 30-day baseline (${pct(mu)}).`
      : `Restore PR cycle time to within 1σ of the 30-day baseline (${pct(mu)} days).`;

  return [
    `# Intent: Maintain — ${metric} (${date})`,
    "Author: tier2-v3-maintain. Status: draft.",
    "",
    "## Problem",
    problem,
    "",
    "## Proposed outcome",
    outcome,
    "",
    "## Affected users and systems",
    "CI pipeline and delivery flow (auto-detected by σ-band maintain loop).",
    "",
    "## Constraints",
    "Fixes must pass checkpoint gate; maintain workflow never auto-merges.",
    "",
    "## Open questions",
    "- [ ] Confirm root cause vs transient spike",
    "- [ ] Tune maintain/bands.json if this is a false positive",
    "- [ ] Route to product owner if the finding is process-facing",
    "",
  ].join("\n");
}

function openIntentPr(root, relPath, date, dryRun) {
  const baseBranch =
    arg("base") ||
    process.env.DEFAULT_BRANCH ||
    process.env.INTENT_BASE_BRANCH ||
    "main";
  const branch = `intent/maintain-${date}`;

  if (dryRun) {
    console.log(`# Would open draft PR on branch ${branch} → ${relPath}`);
    return null;
  }

  if (!hasGh()) {
    console.log("gh CLI not available — intent file written locally only");
    return null;
  }

  try {
    execFileSync("git", ["fetch", "origin", baseBranch], {
      cwd: root,
      stdio: "inherit",
    });
  } catch {
    /* local clone may already have base */
  }

  try {
    execFileSync("git", ["checkout", "-B", branch, `origin/${baseBranch}`], {
      cwd: root,
      stdio: "inherit",
    });
  } catch {
    execFileSync("git", ["checkout", "-B", branch], {
      cwd: root,
      stdio: "inherit",
    });
  }

  execFileSync("git", ["add", relPath], { cwd: root, stdio: "inherit" });
  try {
    execFileSync(
      "git",
      ["commit", "-m", `intent: maintain σ-band ${date} → ${relPath}`],
      { cwd: root, stdio: "inherit" },
    );
  } catch (err) {
    if (/nothing to commit|no changes added/i.test(String(err.stderr || err.message))) {
      console.log("No changes to commit — maintain intent may already exist");
      return null;
    }
    throw err;
  }

  execFileSync("git", ["push", "-u", "origin", branch, "--force-with-lease"], {
    cwd: root,
    stdio: "inherit",
  });

  const token = process.env.GH_TOKEN || process.env.GITHUB_TOKEN;
  const env = token ? { ...process.env, GH_TOKEN: token, GITHUB_TOKEN: token } : process.env;

  const prUrl = execFileSync(
    "gh",
    [
      "pr",
      "create",
      "--draft",
      "--base",
      baseBranch,
      "--head",
      branch,
      "--title",
      `intent: maintain σ-band (${date})`,
      "--body",
      [
        "Auto-generated maintain intent from σ-band detection.",
        "",
        `**Intent file:** \`${relPath}\``,
        "",
        "On-call: triage (fix now / schedule / dismiss). Dismissals tune `maintain/bands.json`.",
      ].join("\n"),
    ],
    { cwd: root, encoding: "utf8", env, stdio: ["ignore", "pipe", "pipe"] },
  ).trim();

  console.log(`Opened draft PR: ${prUrl}`);
  return prUrl;
}

export function evaluateMetricConfig(metricConfig, sample) {
  const { current, series, evidence } = sample;
  if (current == null || !series.length) {
    return {
      metric: metricConfig.metric,
      skipped: true,
      reason: evidence?.error || "insufficient data",
      evidence,
    };
  }

  const mu = mean(series);
  const sigma = stdev(series);
  const z = zScore(current, mu, sigma);
  const tier = sigmaTier(z, metricConfig.rules);

  return {
    metric: metricConfig.metric,
    current,
    mean: mu,
    stdev: sigma,
    z,
    tier,
    evidence,
    tiers: metricConfig.tiers || {},
  };
}

export function runBandDetection(root, { dryRun = false, metricsPath = null } = {}) {
  const { path: configPath, metrics } = loadBandsConfig(root);
  const artifact = loadMetricsArtifact(root, metricsPath);
  const date = new Date().toISOString().slice(0, 10);
  const results = [];

  console.log(`Loaded bands config: ${configPath}`);
  if (artifact) console.log(`Using metrics artifact: ${artifact.path}`);
  else console.log("No metrics artifact found — collectors may query gh directly");
  if (dryRun) console.log("(dry-run — no branch/PR gh calls for propose)");

  for (const metricConfig of metrics) {
    const sample = collectMetric(metricConfig.metric, { artifact });
    const evaluation = evaluateMetricConfig(metricConfig, sample);
    results.push(evaluation);

    if (evaluation.skipped) {
      console.log(
        `[skip] ${metricConfig.metric}: ${evaluation.reason}`,
      );
      continue;
    }

    console.log(
      `[metric] ${evaluation.metric}: current=${evaluation.current.toFixed(4)} mean=${evaluation.mean.toFixed(4)} σ=${evaluation.stdev.toFixed(4)} z=${evaluation.z.toFixed(2)} tier=${evaluation.tier || "normal"}`,
    );

    if (!evaluation.tier) continue;

    const tierCfg = evaluation.tiers[evaluation.tier];
    if (!tierCfg) continue;

    const action = tierCfg.action;
    if (action === "log") {
      console.log(`[1σ] ${evaluation.metric}: within elevated band — logged only`);
      continue;
    }

    if (action === "diagnose") {
      const msg = diagnoseCiFailures(evaluation.evidence, tierCfg.tools);
      console.log(msg);
      continue;
    }

    if (action === "propose") {
      const routes = tierCfg.routes || [];
      if (!routes.includes("intent_pr")) {
        console.log(`[propose] ${evaluation.metric}: no intent_pr route configured`);
        continue;
      }

      const relPath = `intent/maintain-${date}.md`;
      const content = renderMaintainIntent({
        metric: evaluation.metric,
        current: evaluation.current,
        mu: evaluation.mean,
        sigma: evaluation.stdev,
        z: evaluation.z,
        tier: evaluation.tier,
        date,
      });

      const absPath = path.join(root, relPath);
      if (dryRun) {
        console.log(`# Would write ${relPath}\n`);
        console.log(content);
      } else {
        mkdirSync(path.dirname(absPath), { recursive: true });
        writeFileSync(absPath, content, "utf8");
        console.log(`Wrote ${relPath}`);
      }

      openIntentPr(root, relPath, date, dryRun);
    }
  }

  return results;
}

const __filename = fileURLToPath(import.meta.url);
const isMain = process.argv[1] && path.resolve(process.argv[1]) === __filename;

if (isMain) {
  const root = path.resolve(arg("root") || process.cwd());
  const dryRun = hasFlag("dry-run");
  const metricsPath = arg("metrics") || null;

  if (!hasGh() && !dryRun && !loadMetricsArtifact(root, metricsPath)) {
    console.log("gh CLI not available and no metrics artifact — running in log-only mode");
  }

  try {
    const results = runBandDetection(root, { dryRun, metricsPath });
    console.log(JSON.stringify({ date: new Date().toISOString(), results }, null, 2));
  } catch (err) {
    console.error(err.message || err);
    process.exit(1);
  }
}
