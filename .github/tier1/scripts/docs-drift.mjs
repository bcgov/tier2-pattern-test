#!/usr/bin/env node
/**
 * Detect when code paths have newer commits than doc paths; write a report
 * and optionally open a draft PR. Optional LLM section drafts doc update hints.
 * Skips when agent.mode=gh-aw.
 */
import { existsSync, mkdirSync, writeFileSync, statSync, readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { loadConfig, repoRoot } from "./lib/config.mjs";
import { ensureLabel, gh } from "./lib/gh.mjs";
import { resolveAgentMode, skipIfGhAw } from "./lib/agent-mode.mjs";
import { chatCompletion } from "./lib/llm.mjs";

function git(args, root) {
  return execFileSync("git", args, {
    cwd: root,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  }).trim();
}

function listFiles(root, rel) {
  const abs = path.join(root, rel);
  if (!existsSync(abs)) return [];
  const st = statSync(abs);
  if (st.isFile()) return [rel.replace(/\\/g, "/")];
  const out = [];
  const walk = (dir, prefix) => {
    for (const name of readdirSync(dir)) {
      if (name === "node_modules" || name === ".git") continue;
      const p = path.join(dir, name);
      const relPath = path.join(prefix, name).replace(/\\/g, "/");
      if (statSync(p).isDirectory()) walk(p, relPath);
      else out.push(relPath);
    }
  };
  walk(abs, rel.replace(/\/$/, ""));
  return out;
}

function latestCommitTs(root, files) {
  if (!files.length) return 0;
  // git log -1 --format=%ct -- <files>
  try {
    const out = git(["log", "-1", "--format=%ct", "--", ...files], root);
    return out ? Number(out) : 0;
  } catch {
    return 0;
  }
}

const root = repoRoot();
const cfg = loadConfig(root);
if (!cfg.docs_drift?.enabled) {
  console.log("docs_drift disabled");
  process.exit(0);
}

const mode = resolveAgentMode(cfg);
console.log(`agent.mode resolved: ${mode}`);
if (skipIfGhAw(mode, "docs drift")) process.exit(0);

const docFiles = (cfg.docs_drift.doc_paths || []).flatMap((p) => listFiles(root, p));
const codeFiles = (cfg.docs_drift.code_paths || []).flatMap((p) => listFiles(root, p));

if (!codeFiles.length) {
  console.log("No code files under code_paths — skip");
  process.exit(0);
}

const docTs = latestCommitTs(root, docFiles.length ? docFiles : ["README.md"]);
const codeTs = latestCommitTs(root, codeFiles);

const drift = codeTs > docTs + 60; // code commit newer than docs by >60s
const reportPath = cfg.docs_drift.report_path || "docs/tier1-docs-drift-report.md";
const dryRun = process.argv.includes("--dry-run");

let agentSection = "";
let source = "heuristic";
if (drift && mode === "llm") {
  const llmHints = await llmDocHints(cfg, root, codeFiles, docFiles);
  if (llmHints) {
    agentSection = ["", "## Agent-suggested doc updates", "", llmHints, ""].join("\n");
    source = "llm";
  }
}

const report = [
  `# Docs drift report`,
  "",
  `Project: **${cfg.project || "repo"}**`,
  `Generated: ${new Date().toISOString()}`,
  `Mode: \`${mode}\` · source: \`${source}\``,
  "",
  `| Signal | Value |`,
  `| --- | --- |`,
  `| Code paths | ${(cfg.docs_drift.code_paths || []).join(", ")} |`,
  `| Doc paths | ${(cfg.docs_drift.doc_paths || []).join(", ")} |`,
  `| Latest code commit (unix) | ${codeTs || "n/a"} |`,
  `| Latest docs commit (unix) | ${docTs || "n/a"} |`,
  `| Drift detected | ${drift ? "YES" : "no"} |`,
  "",
  "## What to do",
  "",
  "1. Review recent changes under code paths.",
  "2. Update README/docs to match public behaviour.",
  "3. Merge this report PR or close after docs are updated.",
  agentSection,
  "## Recent code files (sample)",
  "",
  ...codeFiles.slice(0, 40).map((f) => `- \`${f}\``),
  "",
  "_Tier 1 — timestamp drift detection; LLM section is advisory only._",
  "",
].join("\n");

async function llmDocHints(cfg, root, codeFiles, docFiles) {
  const samples = [];
  for (const f of codeFiles.slice(0, 5)) {
    try {
      const text = readFileSync(path.join(root, f), "utf8").slice(0, 1500);
      samples.push(`### ${f}\n\`\`\`\n${text}\n\`\`\``);
    } catch {
      /* skip */
    }
  }
  const docSample = docFiles.slice(0, 3).map((f) => {
    try {
      return `### ${f}\n${readFileSync(path.join(root, f), "utf8").slice(0, 1200)}`;
    } catch {
      return `### ${f}\n(unreadable)`;
    }
  });

  const system = `You help keep docs aligned with code. Suggest concrete doc edits in markdown.
Do not invent APIs not visible in the code samples. Keep under 350 words.`;
  const user = ["Code samples:", ...samples, "", "Current docs:", ...docSample].join("\n");
  return chatCompletion(cfg, system, user);
}

console.log(report);

if (!drift) {
  console.log("No drift — exiting 0");
  process.exit(0);
}

if (dryRun) {
  console.log("Dry run — not opening PR/issue");
  process.exit(0);
}

mkdirSync(path.dirname(path.join(root, reportPath)), { recursive: true });
writeFileSync(path.join(root, reportPath), report);

if (cfg.docs_drift.open_pull_request) {
  const branch = `tier1/docs-drift-${new Date().toISOString().slice(0, 10).replace(/-/g, "")}`;
  try {
    git(["checkout", "-B", branch], root);
    git(["add", reportPath], root);
    git(
      [
        "commit",
        "-m",
        "chore(tier1): docs drift report",
        "-m",
        "Automated Tier 1 docs drift detection. Update docs and close.",
      ],
      root,
    );
    git(["push", "-u", "origin", branch, "--force"], root);
    ensureLabel("tier1-docs-drift", "C5DEF5", "Docs may be behind code");
    const url = gh([
      "pr",
      "create",
      "--draft",
      "--title",
      "chore(tier1): docs may have drifted from code",
      "--body",
      [
        "Tier 1 docs-drift workflow detected **code commits newer than docs**.",
        "",
        `See \`${reportPath}\`.`,
        "",
        "Please update documentation or explain why no doc change is needed, then close this PR.",
      ].join("\n"),
      "--label",
      "tier1-docs-drift",
    ]);
    console.log("Opened PR:", url);
  } catch (err) {
    console.error("PR path failed, falling back to issue:", err.message);
    ensureLabel("tier1-docs-drift", "C5DEF5");
    gh([
      "issue",
      "create",
      "--title",
      "Tier 1: docs may have drifted from code",
      "--body",
      report,
      "--label",
      "tier1-docs-drift",
    ]);
  }
} else {
  ensureLabel("tier1-docs-drift", "C5DEF5");
  gh([
    "issue",
    "create",
    "--title",
    "Tier 1: docs may have drifted from code",
    "--body",
    report,
    "--label",
    "tier1-docs-drift",
  ]);
}
