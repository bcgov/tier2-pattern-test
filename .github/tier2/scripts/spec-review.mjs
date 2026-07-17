#!/usr/bin/env node
/**
 * Spec-aware PR review (heuristic + optional LLM).
 * Checks that implementation PRs reference spec/features and evidence file.
 * Env: PR_NUMBER or --pr N
 */
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";

function loadConfig(root) {
  const p = path.join(root, "tier2.config.json");
  if (!existsSync(p)) throw new Error("Missing tier2.config.json");
  return JSON.parse(readFileSync(p, "utf8"));
}

function gh(args) {
  return execFileSync("gh", args, { encoding: "utf8" }).trim();
}

function arg(name) {
  const i = process.argv.indexOf(`--${name}`);
  return i === -1 ? undefined : process.argv[i + 1];
}

const root = process.env.GITHUB_WORKSPACE || process.cwd();
const cfg = loadConfig(root);
if (cfg.spec_review?.enabled === false) {
  console.log("spec_review disabled");
  process.exit(0);
}

const reviewMode = String(cfg.spec_review?.mode || cfg.agent?.mode || "heuristic").toLowerCase();
if (reviewMode === "gh-aw" || reviewMode === "ghaw") {
  console.log(
    'Skipping Actions spec-review — mode is gh-aw. Use compiled tier2-spec-review.lock.yml',
  );
  process.exit(0);
}

const pr = arg("pr") || process.env.PR_NUMBER;
if (!pr) {
  console.error("PR_NUMBER or --pr required");
  process.exit(1);
}

const prMeta = JSON.parse(
  gh(["pr", "view", String(pr), "--json", "title,body,files,labels,author,baseRefName"]),
);
const files = (prMeta.files || []).map((f) => f.path);
const implPrefixes = cfg.spec_review?.paths || cfg.checkpoints?.impl_path_prefixes || ["src/"];
const touchesImpl = files.some((f) => implPrefixes.some((p) => f.startsWith(p)));
const touchesSpec = files.some((f) => f.startsWith("spec/") || f.includes("constitution"));

const findings = [];
const body = `${prMeta.title || ""}\n${prMeta.body || ""}`;

if (touchesImpl) {
  if (!existsSync(path.join(root, "spec/spec.md"))) {
    findings.push({ severity: "error", code: "no_spec", message: "Implementation PR but spec/spec.md missing" });
  }
  if (!/spec\/|features\/|#\d+|TASK-/i.test(body) && !touchesSpec) {
    findings.push({
      severity: "warning",
      code: "no_spec_trace",
      message: "PR body should link a spec section, feature file, or task id",
    });
  }
  const evidencePath = cfg.spec_review?.evidence_path || "docs/pr-evidence.md";
  const hasEvidenceInPr = files.includes(evidencePath);
  const evidenceOnDisk = existsSync(path.join(root, evidencePath));
  if (cfg.spec_review?.require_evidence && !hasEvidenceInPr && !evidenceOnDisk) {
    findings.push({
      severity: "warning",
      code: "no_evidence",
      message: `Missing ${evidencePath} — generate with packs/pr-evidence/generate.mjs`,
    });
  }
  const featureDir = path.join(root, "spec/features");
  if (existsSync(featureDir)) {
    const features = execFileSync("ls", [featureDir], { encoding: "utf8" })
      .split("\n")
      .filter((f) => f.endsWith(".feature"));
    if (features.length === 0) {
      findings.push({ severity: "error", code: "no_features", message: "No spec/features/*.feature files" });
    }
  }
}

// Optional LLM narrative
let llmNote = "";
const mode = (cfg.spec_review?.mode || cfg.agent?.mode || "heuristic").toLowerCase();
const apiKey = process.env.TIER1_LLM_API_KEY || process.env.OPENAI_API_KEY;
if ((mode === "llm" || mode === "auto") && apiKey && touchesImpl) {
  try {
    const base = (process.env.TIER1_LLM_BASE_URL || cfg.agent?.llm?.base_url || "https://api.openai.com/v1").replace(
      /\/$/,
      "",
    );
    const model = process.env.TIER1_LLM_MODEL || cfg.agent?.llm?.model || "gpt-4o-mini";
    const res = await fetch(`${base}/chat/completions`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model,
        temperature: 0.2,
        messages: [
          {
            role: "system",
            content:
              "You review PRs against a BC Gov agentic SDLC. Comment briefly whether the change appears traced to spec/features and constitution constraints (WCAG, design system, PIA, OpenShift). Max 200 words.",
          },
          {
            role: "user",
            content: `PR title: ${prMeta.title}\nBody:\n${prMeta.body}\nFiles:\n${files.join("\n")}\nFindings so far: ${JSON.stringify(findings)}`,
          },
        ],
      }),
    });
    if (res.ok) {
      const data = await res.json();
      llmNote = data.choices?.[0]?.message?.content || "";
    }
  } catch (e) {
    console.warn("LLM review skipped:", e.message);
  }
}

const errors = findings.filter((f) => f.severity === "error");
const warnings = findings.filter((f) => f.severity === "warning");
const status = errors.length ? "FAIL" : warnings.length ? "WARN" : "PASS";

const comment = [
  `### Tier 2 spec review · \`${status}\``,
  "",
  `| | |`,
  `| --- | --- |`,
  `| Touches implementation | ${touchesImpl} |`,
  `| Touches spec | ${touchesSpec} |`,
  `| Findings | ${findings.length} |`,
  "",
  ...(findings.length
    ? findings.map((f) => `- **${f.severity}** \`${f.code}\`: ${f.message}`)
    : ["- No blocking findings from heuristic checks."]),
  "",
  llmNote ? `## Agent notes\n\n${llmNote}\n` : "",
  "_Tier 2 pattern — human still owns checkpoint 3 (merge)._",
].join("\n");

console.log(comment);

if (process.env.GITHUB_TOKEN || process.env.GH_TOKEN) {
  try {
    gh(["pr", "comment", String(pr), "--body", comment]);
    console.log("Commented on PR", pr);
  } catch (e) {
    console.warn("Could not comment:", e.message);
  }
}

if (process.env.GITHUB_STEP_SUMMARY) {
  const { appendFileSync } = await import("node:fs");
  appendFileSync(process.env.GITHUB_STEP_SUMMARY, comment + "\n");
}

process.exit(errors.length ? 1 : 0);
