#!/usr/bin/env node
/**
 * Assign GitHub Copilot coding agent when an issue is labeled ready-for-agent.
 *
 * Requires a *user* token (PAT / OAuth / App user-to-server). GITHUB_TOKEN
 * (Actions installation token) cannot assign Copilot — billing is tied to a user.
 *
 * Env:
 *   ISSUE_NUMBER (required)
 *   COPILOT_ASSIGN_TOKEN or COPILOT_GITHUB_TOKEN (user PAT)
 *   GITHUB_TOKEN (for issue comments if assign token missing)
 *   GITHUB_REPOSITORY (owner/repo) or --repo
 */
import { appendFileSync, existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";

function loadConfig(root) {
  const p = path.join(root, "tier2.config.json");
  if (!existsSync(p)) throw new Error("Missing tier2.config.json");
  return JSON.parse(readFileSync(p, "utf8"));
}

function arg(name) {
  const i = process.argv.indexOf(`--${name}`);
  return i === -1 ? undefined : process.argv[i + 1];
}

function ghJson(args, token, input) {
  return execFileSync("gh", args, {
    encoding: "utf8",
    input,
    env: { ...process.env, GH_TOKEN: token, GITHUB_TOKEN: token },
  });
}

const root = process.env.GITHUB_WORKSPACE || process.cwd();
const cfg = loadConfig(root);
const ca = cfg.coding_agent || {};

if (ca.enabled === false || ca.auto_assign === false) {
  console.log("coding_agent.auto_assign disabled — skip");
  process.exit(0);
}

const issue = arg("issue") || process.env.ISSUE_NUMBER;
if (!issue) {
  console.error("ISSUE_NUMBER or --issue required");
  process.exit(1);
}

const repo =
  arg("repo") ||
  process.env.GITHUB_REPOSITORY ||
  (() => {
    try {
      return execFileSync("gh", ["repo", "view", "--json", "nameWithOwner", "-q", ".nameWithOwner"], {
        encoding: "utf8",
      }).trim();
    } catch {
      return null;
    }
  })();

if (!repo || !repo.includes("/")) {
  console.error("GITHUB_REPOSITORY or --repo owner/name required");
  process.exit(1);
}

const userToken = process.env.COPILOT_ASSIGN_TOKEN || process.env.COPILOT_GITHUB_TOKEN || "";
const commentToken = process.env.GITHUB_TOKEN || process.env.GH_TOKEN || userToken;

function postComment(body) {
  if (!commentToken) return;
  try {
    ghJson(
      [
        "api",
        "--method",
        "POST",
        "-H",
        "Accept: application/vnd.github+json",
        `repos/${repo}/issues/${issue}/comments`,
        "--input",
        "-",
      ],
      commentToken,
      JSON.stringify({ body }),
    );
  } catch (e) {
    console.warn("Could not comment:", e.message);
  }
}

if (!userToken) {
  const msg = [
    "### Tier 2 — coding agent not assigned",
    "",
    "Label `ready-for-agent` was applied, but secret **`COPILOT_ASSIGN_TOKEN`** is not set.",
    "",
    "Copilot assignment requires a **user** PAT (Actions `GITHUB_TOKEN` cannot assign Copilot):",
    "",
    "- Fine-grained: Issues (RW), Contents (RW), Pull requests (RW), Metadata (R)",
    "- Classic: `repo` scope",
    "- Copilot coding agent must be enabled for this repository and the token owner",
    "",
    "After adding the secret, remove and re-apply `ready-for-agent`.",
  ].join("\n");
  console.error(msg);
  postComment(msg);
  process.exit(1);
}

const assignLabel = ca.assign_label || "ready-for-agent";
const baseBranch = ca.base_branch || "main";
const assignee = ca.assignee || "copilot-swe-agent[bot]";
const customInstructions =
  (ca.custom_instructions && String(ca.custom_instructions).trim()) ||
  [
    "Follow AGENTS.md and the repository constitution (constitution.md / .specify/memory/constitution.md).",
    "Implement only what the issue acceptance criteria and linked spec/features require.",
    "Open a draft pull request. Do not merge.",
    "Update docs/pr-evidence.md when touching implementation paths.",
    "Prefer B.C. Design System components for UI; meet WCAG 2.1 AA.",
  ].join(" ");

const issueMeta = JSON.parse(
  ghJson(
    ["api", `repos/${repo}/issues/${issue}`, "-H", "Accept: application/vnd.github+json"],
    userToken,
  ),
);

const labels = (issueMeta.labels || []).map((l) => l.name);
if (!labels.includes(assignLabel)) {
  console.log(`Issue #${issue} lacks label ${assignLabel} — skip`);
  process.exit(0);
}

const already = (issueMeta.assignees || []).some((a) =>
  ["copilot-swe-agent[bot]", "copilot-swe-agent", "Copilot"].includes(a.login),
);
if (already) {
  console.log(`Issue #${issue} already assigned to Copilot — skip`);
  process.exit(0);
}

const assignBody = {
  assignees: [assignee],
  agent_assignment: {
    target_repo: repo,
    base_branch: baseBranch,
    custom_instructions: customInstructions,
    custom_agent: ca.custom_agent || "",
    model: ca.model || "",
  },
};

console.log(`Assigning ${assignee} to ${repo}#${issue} (base=${baseBranch})…`);

let res;
try {
  res = ghJson(
    [
      "api",
      "--method",
      "POST",
      "-H",
      "Accept: application/vnd.github+json",
      "-H",
      "X-GitHub-Api-Version: 2022-11-28",
      `repos/${repo}/issues/${issue}/assignees`,
      "--input",
      "-",
    ],
    userToken,
    JSON.stringify(assignBody),
  );
} catch (e) {
  const err = e.stderr?.toString?.() || e.message;
  console.error("Assign failed:", err);
  postComment(
    [
      "### Tier 2 — coding agent assign failed",
      "",
      `Could not assign \`${assignee}\` automatically.`,
      "",
      "Common causes:",
      "- Token is not a **user** PAT / OAuth token",
      "- Copilot coding agent is not enabled for this repo + token owner",
      "- PAT missing Issues / Contents / Pull requests write",
      "",
      `Error (truncated): \`${String(err).slice(0, 400).replace(/`/g, "'")}\``,
    ].join("\n"),
  );
  process.exit(1);
}

const assigned = JSON.parse(res);
const logins = (assigned.assignees || []).map((a) => a.login).join(", ");
console.log(`Assigned. Assignees now: ${logins || "(none returned)"}`);

const comment = [
  "### Tier 2 — coding agent assigned",
  "",
  `Assigned **${assignee}** because of label \`${assignLabel}\`.`,
  "",
  `- Base branch: \`${baseBranch}\``,
  "- Expect a **draft PR** from Copilot; humans own merge (checkpoint 3).",
  "- Checkpoint gate + spec review will run on that PR.",
].join("\n");

postComment(comment);

if (process.env.GITHUB_STEP_SUMMARY) {
  appendFileSync(process.env.GITHUB_STEP_SUMMARY, comment + "\n");
}
