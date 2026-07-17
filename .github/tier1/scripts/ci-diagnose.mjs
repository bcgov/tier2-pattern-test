#!/usr/bin/env node
/**
 * CI failure diagnosis — heuristic and/or LLM.
 * Skips when agent.mode=gh-aw.
 */
import { loadConfig, repoRoot } from "./lib/config.mjs";
import { gh } from "./lib/gh.mjs";
import { resolveAgentMode, skipIfGhAw } from "./lib/agent-mode.mjs";
import { chatCompletion } from "./lib/llm.mjs";

function arg(name) {
  const i = process.argv.indexOf(`--${name}`);
  return i === -1 ? undefined : process.argv[i + 1];
}

const root = repoRoot();
const cfg = loadConfig(root);
if (!cfg.ci_diagnose?.enabled) {
  console.log("ci_diagnose disabled");
  process.exit(0);
}

const mode = resolveAgentMode(cfg);
console.log(`agent.mode resolved: ${mode}`);
if (skipIfGhAw(mode, "ci diagnose")) process.exit(0);

const runId = process.env.RUN_ID || arg("run-id");
const workflowName = process.env.WORKFLOW_NAME || "";
const runUrl = process.env.RUN_URL || "";
const headSha = process.env.HEAD_SHA || "";

if (!runId) {
  console.error("RUN_ID required");
  process.exit(1);
}

const ignore = new Set(cfg.ci_diagnose.ignore_workflows || []);
if (ignore.has(workflowName)) {
  console.log(`Ignoring workflow: ${workflowName}`);
  process.exit(0);
}

let logText = "";
try {
  logText = gh(["run", "view", String(runId), "--log-failed"]);
} catch (err) {
  logText = `Could not fetch failed logs: ${err.message}`;
}

const max = cfg.ci_diagnose.max_log_chars ?? 12000;
if (logText.length > max) logText = logText.slice(-max);

const findings = analyze(logText);
const project = cfg.project || "repo";
let source = "heuristic";
let narrative = heuristicNarrative(findings);

if (mode === "llm") {
  const llmText = await llmDiagnose(cfg, { workflowName, runUrl, headSha, logText, findings });
  if (llmText) {
    narrative = llmText;
    source = "llm";
  } else {
    console.warn("LLM diagnose failed — using heuristic");
  }
}

const body = [
  `### Tier 1 CI diagnosis (${project}) · \`${source}\``,
  "",
  `| | |`,
  `| --- | --- |`,
  `| Workflow | ${workflowName || "unknown"} |`,
  `| Run | ${runUrl || runId} |`,
  `| SHA | \`${headSha || "n/a"}\` |`,
  "",
  narrative,
  "",
  "<details><summary>Failed log excerpt (truncated)</summary>",
  "",
  "```",
  logText.slice(-4000),
  "```",
  "",
  "</details>",
  "",
  `_Tier 1 · mode=${mode} · source=${source}_`,
].join("\n");

let commented = false;
if (headSha) {
  try {
    const prs = JSON.parse(
      gh(["pr", "list", "--state", "open", "--json", "number,headRefOid,url"]),
    );
    const pr = prs.find((p) => p.headRefOid === headSha);
    if (pr) {
      gh(["pr", "comment", String(pr.number), "--body", body]);
      console.log("Commented on PR", pr.number);
      commented = true;
    }
  } catch (err) {
    console.warn("PR comment failed:", err.message);
  }
}

if (!commented) {
  const title = `Tier 1: CI failed — ${workflowName || "workflow"} (#${runId})`;
  gh(["issue", "create", "--title", title, "--body", body]);
  console.log("Opened diagnosis issue");
}

function heuristicNarrative(findings) {
  const lines = [
    "## Likely causes",
    "",
    ...(findings.length
      ? findings.map((f, i) => `${i + 1}. **${f.title}** — ${f.detail}`)
      : ["1. No common pattern matched — inspect the log excerpt below."]),
    "",
    "## Suggested next steps",
    "",
    ...(findings.flatMap((f) => f.steps.map((s) => `- ${s}`)).slice(0, 8).length
      ? findings.flatMap((f) => f.steps.map((s) => `- ${s}`)).slice(0, 8)
      : [
          "- Open the failed job log and jump to the first `Error` / `FAIL` line.",
          "- Re-run locally with the same Node/OS as the workflow.",
        ]),
  ];
  return lines.join("\n");
}

async function llmDiagnose(cfg, ctx) {
  const system = `You are a CI failure analyst for a government digital service repo.
Write concise GitHub-flavored markdown with sections:
## Likely causes
## Suggested next steps
Be specific to the log. Do not invent files that are not evidenced. Max ~400 words.`;

  const user = [
    `Workflow: ${ctx.workflowName}`,
    `Run: ${ctx.runUrl}`,
    `SHA: ${ctx.headSha}`,
    `Heuristic hits: ${JSON.stringify(ctx.findings)}`,
    "",
    "Failed log:",
    ctx.logText.slice(-8000),
  ].join("\n");

  return chatCompletion(cfg, system, user, { json: false });
}

function analyze(log) {
  const L = log.toLowerCase();
  const out = [];
  const add = (title, detail, steps) => out.push({ title, detail, steps });

  if (/npm err!|yarn error|pnpm.*err|err_pnpm/.test(L)) {
    add("Package install / npm error", "Dependency install or script failed.", [
      "Delete lockfile mismatch locally; run the same package manager as CI.",
      "Check Node version against `.nvmrc` / `engines` in package.json.",
    ]);
  }
  if (/cannot find module|module not found|err_module_not_found/.test(L)) {
    add("Missing module", "A required package or file path was not found.", [
      "Confirm the import path and that the dependency is in package.json.",
    ]);
  }
  if (/test failed|failing tests|assertionerror|expected .* received|× |✕ /.test(L)) {
    add("Test failure", "One or more automated tests failed.", [
      "Run the same test command locally.",
      "Check for flake vs real regression on the changed files.",
    ]);
  }
  if (/eslint|prettier|tsc\b|type error|failed to compile/.test(L)) {
    add("Lint / typecheck", "Static analysis rejected the change.", [
      "Run lint/typecheck locally and fix reported files.",
    ]);
  }
  if (/permission denied|access denied|403|resource not accessible by integration/.test(L)) {
    add("Permissions", "Token or org policy blocked an API/file operation.", [
      "Check workflow `permissions:` and org Actions settings.",
    ]);
  }
  if (/enoent|no such file|pathspec/.test(L)) {
    add("Missing file/path", "A path referenced by the workflow does not exist.", [
      "Verify working-directory and paths in the workflow YAML.",
    ]);
  }
  if (/docker|buildx|image/.test(L) && /error|failed/.test(L)) {
    add("Container build", "Docker/image build step failed.", [
      "Build the image locally with the same Dockerfile args.",
    ]);
  }
  if (/intentional failure for tier 1/i.test(log)) {
    add("Demo failure", "This is the Tier 1 demo-fail workflow.", [
      "No product fix needed — used to validate CI diagnose.",
    ]);
  }
  return out;
}
