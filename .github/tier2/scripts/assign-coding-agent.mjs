#!/usr/bin/env node
/**
 * Assign GitHub Copilot coding agent when an issue is labeled ready-for-agent.
 *
 * Requires a *user* token (PAT / OAuth / App user-to-server). GITHUB_TOKEN
 * (Actions installation token) cannot assign Copilot — billing is tied to a user.
 *
 * Env:
 *   ISSUE_NUMBER (required)
 *   COPILOT_ASSIGN_TOKEN or COPILOT_GITHUB_TOKEN or GH_TOKEN (user PAT preferred)
 *   GITHUB_REPOSITORY (owner/repo) or --repo
 */
import { existsSync, readFileSync } from "node:fs";
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

const token =
  process.env.COPILOT_ASSIGN_TOKEN ||
  process.env.COPILOT_GITHUB_TOKEN ||
  process.env.GH_TOKEN ||
  process.env.GITHUB_TOKEN;

if (!token) {
  console.error(
    "No user token. Set repo secret COPILOT_ASSIGN_TOKEN (fine-grained PAT: Issues RW, Contents RW, Metadata R, Pull requests RW).",
  );
  process.exit(1);
}

const assignLabel = ca.assign_label || "ready-for-agent";
const baseBranch = ca.base_branch || "main";
const assignee = ca.assignee || "copilot-swe-agent[bot]";
const customInstructions =
  ca.custom_instructions ||
  [
    "Follow AGENTS.md and the repository constitution (constitution.md / .specify/memory/constitution.md).",
    "Implement only what the issue acceptance criteria and linked spec/features require.",
    "Open a draft pull request. Do not merge.",
    "Update docs/pr-evidence.md when touching implementation paths.",
    "Prefer B.C. Design System components for UI; meet WCAG 2.1 AA.",
  ].join(" ");

const issueMeta = JSON.parse(
  execFileSync(
    "gh",
    ["api", `repos/${repo}/issues/${issue}`, "-H", "Accept: application/vnd.github+json"],
    {
      encoding: "utf8",
      env: { ...process.env, GH_TOKEN: token, GITHUB_TOKEN: token },
    },
  ),
);

const labels = (issueMeta.labels || []).map((l) => l.name);
if (!labels.includes(assignLabel)) {
  console.log(`Issue #${issue} lacks label ${assignLabel} — skip`);
  process.exit(0);
}

const already = (issueMeta.assignees || []).some(
  (a) => a.login === "copilot-swe-agent[bot]" || a.login === "copilot-swe-agent" || a.login === "Copilot",
);
if (already) {
  console.log(`Issue #${issue} already assigned to Copilot — skip`);
  process.exit(0);
}

const body = {
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
  res = execFileSync(
    "gh",
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
    {
      encoding: "utf8",
      input: JSON.stringify(body),
      env: { ...process.env, GH_TOKEN: token, GITHUB_TOKEN: token },
    },
  );
} catch (e) {
  const err = e.stderr?.toString?.() || e.message;
  console.error("Assign failed:", err);
  // Comment guidance when token cannot assign Copilot
  try {
    execFileSync(
      "gh",
      [
        "api",
        "--method",
        "POST",
        `repos/${repo}/issues/${issue}/comments`,
        "-f",
        `body=### Tier 2 — coding agent assign failed

Could not assign \`${assignee}\` automatically.

**Likely cause:** Actions \`GITHUB_TOKEN\` cannot assign Copilot (needs a **user** PAT). Set secret \`COPILOT_ASSIGN_TOKEN\` (Issues + Contents + PRs write) and re-apply label \`${assignLabel}\`.

Or assign Copilot manually in the GitHub UI.

Error detail (truncated): \`${String(err).slice(0, 400).replace(/`/g, "'")}\`
`,
      ],
      {
        encoding: "utf8",
        env: {
          ...process.env,
          GH_TOKEN: process.env.GITHUB_TOKEN || token,
          GITHUB_TOKEN: process.env.GITHUB_TOKEN || token,
        },
      },
    );
  } catch {
    /* ignore comment failure */
  }
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

try {
  execFileSync("gh", ["api", "--method", "POST", `repos/${repo}/issues/${issue}/comments`, "-f", `body=${comment}`], {
    encoding: "utf8",
    env: {
      ...process.env,
      GH_TOKEN: process.env.GITHUB_TOKEN || token,
      GITHUB_TOKEN: process.env.GITHUB_TOKEN || token,
    },
  });
} catch (e) {
  console.warn("Could not comment:", e.message);
}

if (process.env.GITHUB_STEP_SUMMARY) {
  const { appendFileSync } = await import("node:fs");
  appendFileSync(process.env.GITHUB_STEP_SUMMARY, comment + "\n");
}
