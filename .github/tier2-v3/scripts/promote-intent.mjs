#!/usr/bin/env node
/**
 * Promote a well-formed GitHub issue to a draft intent/ PR.
 *
 * CLI: --issue N | env ISSUE_NUMBER
 * Dry-run: --dry-run prints rendered intent without branch/PR gh calls.
 * Graceful exit when gh is unavailable (unless --title/--body overrides supplied).
 */
import { existsSync, readFileSync, writeFileSync, mkdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { execFileSync, execSync } from "node:child_process";

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

function gh(args, { input, token } = {}) {
  const env = { ...process.env };
  if (token) {
    env.GH_TOKEN = token;
    env.GITHUB_TOKEN = token;
  }
  return execFileSync("gh", args, {
    encoding: "utf8",
    input,
    env,
    stdio: ["pipe", "pipe", "pipe"],
  }).trim();
}

function slugify(title) {
  return (
    String(title || "intent")
      .toLowerCase()
      .replace(/^feature:\s*/i, "")
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 80) || "intent"
  );
}

function extractSection(body, names) {
  if (!body) return "";
  const wanted = names.map((n) => n.toLowerCase());
  const lines = body.split(/\r?\n/);
  let capture = false;
  let level = 0;
  const parts = [];

  for (const line of lines) {
    const heading = line.match(/^(#{1,6})\s+(.+?)\s*$/);
    if (heading) {
      const name = heading[2].replace(/[*_`]/g, "").trim().toLowerCase();
      if (wanted.some((w) => name === w || name.startsWith(`${w} `))) {
        capture = true;
        level = heading[1].length;
        continue;
      }
      if (capture && heading[1].length <= level) {
        break;
      }
      continue;
    }
    if (capture) parts.push(line);
  }

  return parts.join("\n").trim();
}

function extractFormField(body, fieldId) {
  const re = new RegExp(
    `<!--\\s*${fieldId}\\s*-->[\\s\\S]*?(?=<!--\\s*[a-z_]+\\s*-->|$)`,
    "i",
  );
  const block = body.match(re);
  if (!block) return "";
  return block[0]
    .replace(new RegExp(`<!--\\s*${fieldId}\\s*-->`, "i"), "")
    .replace(/<!--[\s\S]*?-->/g, "")
    .trim();
}

function parseIssueFields(body) {
  const problem =
    extractSection(body, ["Problem", "problem"]) ||
    extractFormField(body, "problem");
  const outcome =
    extractSection(body, ["Outcome", "Proposed outcome", "proposed outcome"]) ||
    extractFormField(body, "outcome");
  const affected =
    extractSection(body, [
      "Affected users and systems",
      "Affected users",
      "Users and systems",
    ]) || extractFormField(body, "affected");
  const constraints =
    extractSection(body, ["Constraints", "Constraints acknowledged"]) ||
    extractFormField(body, "constraints");
  const openQuestions =
    extractSection(body, ["Open questions", "Questions"]) ||
    extractFormField(body, "open_questions");
  const evidence =
    extractSection(body, ["Evidence", "evidence"]) ||
    extractFormField(body, "evidence");

  return { problem, outcome, affected, constraints, openQuestions, evidence };
}

export function hasRequiredIntentFields(body) {
  const { problem, outcome } = parseIssueFields(body || "");
  return Boolean(problem && outcome);
}

function loadTemplate(root) {
  const enrolled = path.join(root, "intent", ".template.md");
  if (existsSync(enrolled)) return readFileSync(enrolled, "utf8");
  const bundle = path.join(
    root,
    ".github",
    "tier2-v3",
    "bundle",
    "intent",
    "intent.template.md",
  );
  if (existsSync(bundle)) return readFileSync(bundle, "utf8");
  const packRelative = fileURLToPath(
    new URL("../bundle/intent/intent.template.md", import.meta.url),
  );
  if (existsSync(packRelative)) {
    return readFileSync(packRelative, "utf8");
  }
  throw new Error(
    "Missing intent template — expected intent/.template.md in repo root",
  );
}

function renderIntent(template, { title, author, fields }) {
  const affected = fields.affected || "TBD — see issue body.";
  const constraints = fields.constraints || "See issue constraints / constitution.";
  const openQuestions = fields.openQuestions
    ? fields.openQuestions.startsWith("-")
      ? fields.openQuestions
      : `- [ ] ${fields.openQuestions}`
    : "- [ ] Confirm scope with product owner\n- [ ] Identify affected systems";
  const evidence =
    fields.evidence ||
    "TBD — link user research, incidents, support tickets, or analytics that motivated this intent.";

  return template
    .replace(/\{\{TITLE\}\}/g, title)
    .replace(/\{\{AUTHOR\}\}/g, author)
    .replace(/\{\{Who is stuck and what hurts\?\}\}/g, fields.problem)
    .replace(/\{\{Measurable outcome\.\}\}/g, fields.outcome)
    .replace(
      /\{\{No new PII, existing auth only, etc\.\}\}/g,
      constraints,
    )
    .replace(
      /\{\{Observations that motivated this intent — user research, incidents, support tickets, analytics\. Link criterion IDs \(@R-xx\.y\) when known\.\}\}/g,
      evidence,
    )
    .replace(/## Affected users and systems\n\{\{…\}\}/g, `## Affected users and systems\n${affected}`)
    .replace(/## Open questions\n- \[ \] \{\{…\}\}/g, `## Open questions\n${openQuestions}`);
}

const root = process.env.GITHUB_WORKSPACE || process.cwd();
const dryRun = hasFlag("dry-run");
const issueNumber = arg("issue") || process.env.ISSUE_NUMBER;
const overrideTitle = arg("title") || process.env.ISSUE_TITLE;
const overrideBody = arg("body") || process.env.ISSUE_BODY;
const overrideAuthor = arg("author") || process.env.ISSUE_AUTHOR || "unknown";

let issue;
if (overrideTitle !== undefined && overrideBody !== undefined) {
  issue = {
    number: issueNumber || "0",
    title: overrideTitle,
    body: overrideBody,
    author: { login: overrideAuthor },
  };
} else {
  if (!issueNumber) {
    console.error("Set ISSUE_NUMBER or --issue (or --title and --body for offline render)");
    process.exit(1);
  }
  if (!hasGh()) {
    console.log("gh CLI not available — skipping intent promotion");
    process.exit(0);
  }
  try {
    issue = JSON.parse(
      gh([
        "issue",
        "view",
        String(issueNumber),
        "--json",
        "title,body,number,author",
      ]),
    );
  } catch (err) {
    console.error("Could not fetch issue:", err.stderr?.toString?.() || err.message);
    process.exit(1);
  }
}

const fields = parseIssueFields(issue.body || "");
if (!fields.problem || !fields.outcome) {
  console.log(
    `Issue #${issue.number} missing required Problem + Outcome sections — skip promotion`,
  );
  process.exit(0);
}

const title = (issue.title || "Untitled").replace(/^feature:\s*/i, "").trim();
const author = issue.author?.login || issue.author?.name || "unknown";
const slug = slugify(title);
const relPath = `intent/${slug}.md`;
const content = renderIntent(loadTemplate(root), { title, author, fields });

if (dryRun) {
  console.log(`# Would write ${relPath} on branch intent/issue-${issue.number}\n`);
  console.log(content);
  process.exit(0);
}

if (!hasGh()) {
  console.log("gh CLI not available — skipping intent promotion");
  process.exit(0);
}

const token = process.env.GH_TOKEN || process.env.GITHUB_TOKEN;
const branch = `intent/issue-${issue.number}`;
const baseBranch =
  arg("base") ||
  process.env.INTENT_BASE_BRANCH ||
  process.env.DEFAULT_BRANCH ||
  "main";

try {
  execSync("git", ["fetch", "origin", baseBranch], { stdio: "inherit", cwd: root });
} catch {
  /* local clone may already have base */
}

try {
  execSync("git", ["checkout", "-B", branch, `origin/${baseBranch}`], {
    stdio: "inherit",
    cwd: root,
  });
} catch {
  execSync("git", ["checkout", "-B", branch], { stdio: "inherit", cwd: root });
}

const absPath = path.join(root, relPath);
mkdirSync(path.dirname(absPath), { recursive: true });
writeFileSync(absPath, content, "utf8");

execSync("git", ["add", relPath], { stdio: "inherit", cwd: root });
try {
  execSync(
    "git",
    ["commit", "-m", `intent: promote issue #${issue.number} → ${relPath}`],
    { stdio: "inherit", cwd: root },
  );
} catch (err) {
  if (/nothing to commit|no changes added/i.test(String(err.stderr || err.message))) {
    console.log("No changes to commit — intent file may already match");
    process.exit(0);
  }
  throw err;
}

execSync("git", ["push", "-u", "origin", branch, "--force-with-lease"], {
  stdio: "inherit",
  cwd: root,
});

const prBody = [
  `Promotes GitHub issue #${issue.number} to stage-1 intent.`,
  "",
  `**Source issue:** #${issue.number}`,
  `**Intent file:** \`${relPath}\``,
  "",
  "Review Problem, outcome, and constraints before spec work (checkpoint 1).",
].join("\n");

const prUrl = gh(
  [
    "pr",
    "create",
    "--draft",
    "--base",
    baseBranch,
    "--head",
    branch,
    "--title",
    `intent: ${title} (from #${issue.number})`,
    "--body",
    prBody,
  ],
  { token },
);

console.log(`Opened draft PR: ${prUrl}`);

try {
  gh(
    [
      "issue",
      "comment",
      String(issue.number),
      "--body",
      [
        "### Tier 2 v3 — intent promoted",
        "",
        `Draft PR opened for \`${relPath}\`: ${prUrl}`,
        "",
        "Review the intent artifact before moving to spec (checkpoint 1).",
      ].join("\n"),
    ],
    { token },
  );
} catch (e) {
  console.warn("Could not comment on issue:", e.message);
}

console.log(
  JSON.stringify(
    { issue: issue.number, branch, path: relPath, pr: prUrl },
    null,
    2,
  ),
);
