#!/usr/bin/env node
/**
 * Risk-tiered ceremony: direct vs pipeline mode for Tier 2 v3 checkpoint gate.
 * Conservative by default — pipeline when uncertain (academy factory design §Triage).
 */
import { execFileSync } from "node:child_process";
import {
  appendFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  statSync,
} from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const DEFAULT_DIRECT = {
  max_files: 3,
  max_reference_count: 2,
  require_additive: true,
  allowed_prefixes: ["src/", "apps/"],
};

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

function isGitRepo(root) {
  return existsSync(path.join(root, ".git"));
}

function pathAllowed(p, allowedPrefixes) {
  const norm = p.replace(/\\/g, "/");
  return allowedPrefixes.some((prefix) => norm.startsWith(prefix));
}

function countReferences(paths, root) {
  if (!isGitRepo(root)) {
    return { skipped: true, count: null, importers: [] };
  }

  const changedSet = new Set(paths.map((p) => p.replace(/\\/g, "/")));
  const importers = new Set();

  for (const raw of paths) {
    const rel = raw.replace(/\\/g, "/");
    const base = path.basename(rel, path.extname(rel));
    const withoutExt = rel.replace(/\.[^./\\]+$/, "");
    const searchTerms = [...new Set([withoutExt, `${path.dirname(rel)}/${base}`, base])].filter(
      Boolean,
    );

    for (const term of searchTerms) {
      const out = git(
        [
          "grep",
          "-l",
          "-F",
          term,
          "--",
          "*.ts",
          "*.tsx",
          "*.js",
          "*.jsx",
          "*.mjs",
          "*.vue",
          "*.py",
          "*.go",
        ],
        root,
      );
      if (!out) continue;
      for (const line of out.split("\n").filter(Boolean)) {
        const norm = line.replace(/\\/g, "/");
        if (!changedSet.has(norm)) importers.add(norm);
      }
    }
  }

  return { skipped: false, count: importers.size, importers: [...importers] };
}

function checkAdditive(paths, root, baseRef) {
  if (!isGitRepo(root)) {
    return { additive: null, skipped: true, reason: "git unavailable" };
  }
  if (paths.length === 0) {
    return { additive: true, skipped: false };
  }

  const args = ["diff", "--numstat"];
  if (baseRef) args.push(`${baseRef}...HEAD`);
  args.push("--", ...paths);

  const out = git(args, root);
  if (out === null) {
    return { additive: null, skipped: true, reason: "git diff unavailable" };
  }

  for (const line of out.split("\n").filter(Boolean)) {
    const [del, , file] = line.split("\t");
    const deletions = parseInt(del, 10);
    if (deletions > 0) {
      return {
        additive: false,
        skipped: false,
        reason: `deletions in ${file || "changed file"}`,
        deletions,
      };
    }
  }

  return { additive: true, skipped: false };
}

function featureFiles(root) {
  const dir = path.join(root, "spec/features");
  if (!existsSync(dir)) return [];
  return readdirSync(dir)
    .filter((f) => f.endsWith(".feature"))
    .map((f) => path.join(dir, f));
}

function parseHighTierTagLines(body) {
  for (const line of body.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    // Gherkin tag lines only — ignore @tier:high mentions in comments or prose
    if (/^@[\w:-]+/.test(trimmed) && /@tier:high\b/i.test(trimmed)) return true;
  }
  return false;
}

/**
 * High-tier is change-scoped:
 * - @tier:high on a *changed* feature file forces pipeline
 * - OR a changed file's content / path references a high-tier criterion ID from the repo
 * Unrelated small src fixes are not taxed by unrelated high-tier scenarios.
 */
function listHighTierCriterionIds(root) {
  const ids = new Set();
  for (const file of featureFiles(root)) {
    try {
      const body = readFileSync(file, "utf8");
      if (!parseHighTierTagLines(body)) continue;
      // Collect @R-xx.y tags that share a tag line with @tier:high, or appear on the next scenario
      const lines = body.split("\n");
      for (let i = 0; i < lines.length; i++) {
        const trimmed = lines[i].trim();
        if (!trimmed || trimmed.startsWith("#")) continue;
        if (!/^@[\w:-]+/.test(trimmed) || !/@tier:high\b/i.test(trimmed)) continue;
        for (const m of trimmed.matchAll(/@R-(\d+\.\d+)/g)) {
          ids.add(`R-${m[1]}`);
        }
        // Also scan following tag lines until Scenario
        for (let j = i + 1; j < lines.length; j++) {
          const t = lines[j].trim();
          if (!t) continue;
          if (/^\s*Scenario(?: Outline)?:/.test(lines[j])) break;
          if (t.startsWith("@")) {
            for (const m of t.matchAll(/@R-(\d+\.\d+)/g)) ids.add(`R-${m[1]}`);
          } else if (!t.startsWith("#")) break;
        }
      }
    } catch {
      /* ignore */
    }
  }
  return ids;
}

function hasHighTierCriteria(root, changedPaths = null) {
  if (!changedPaths || changedPaths.length === 0) {
    // No path list — do not force pipeline from global feature scan
    return false;
  }

  const normalized = changedPaths.map((p) => p.replace(/\\/g, "/"));

  // 1) Changed feature files that themselves carry @tier:high
  for (const rel of normalized) {
    if (!rel.startsWith("spec/features/") || !rel.endsWith(".feature")) continue;
    const abs = path.join(root, rel);
    if (!existsSync(abs)) continue;
    try {
      if (parseHighTierTagLines(readFileSync(abs, "utf8"))) return true;
    } catch {
      /* ignore */
    }
  }

  // 2) Changed files that reference a high-tier criterion ID
  const highIds = listHighTierCriterionIds(root);
  if (highIds.size === 0) return false;

  for (const rel of normalized) {
    for (const id of highIds) {
      if (rel.includes(id) || rel.includes(`@${id}`)) return true;
    }
    const abs = path.join(root, rel);
    if (!existsSync(abs) || !statSync(abs).isFile()) continue;
    try {
      const text = readFileSync(abs, "utf8");
      for (const id of highIds) {
        if (text.includes(`@${id}`) || text.includes(id) || text.includes(`criterion: ${id}`)) {
          return true;
        }
      }
    } catch {
      /* ignore */
    }
  }

  return false;
}

export { parseHighTierTagLines, hasHighTierCriteria, listHighTierCriterionIds };

/**
 * @param {string[]} paths - changed file paths (repo-relative)
 * @param {object} [opts]
 * @returns {{ mode: 'direct'|'pipeline', reasons: string[], audit: object }}
 */
export function triageChange(paths, opts = {}) {
  const root = path.resolve(opts.root || ".");
  const directCfg = { ...DEFAULT_DIRECT, ...(opts.direct_mode || {}) };
  const {
    max_files,
    max_reference_count,
    require_additive,
    allowed_prefixes,
  } = directCfg;

  const normalized = [...new Set(paths.map((p) => p.replace(/\\/g, "/").trim()).filter(Boolean))];
  const audit = {
    timestamp: new Date().toISOString(),
    paths: normalized,
    checks: {},
    mode: "pipeline",
  };
  const reasons = [];

  if (normalized.length === 0) {
    reasons.push("no implementation paths changed — default pipeline");
    audit.checks.empty = { pass: false };
    audit.mode = "pipeline";
    return { mode: "pipeline", reasons, audit };
  }

  if (typeof opts.highTier === "boolean") {
    if (opts.highTier) {
      reasons.push("@tier:high criterion present — full pipeline required");
      audit.checks.highTier = { pass: false, overridden: true };
      audit.mode = "pipeline";
      return { mode: "pipeline", reasons, audit };
    }
    audit.checks.highTier = { pass: true, overridden: true };
  } else if (hasHighTierCriteria(root, normalized)) {
    reasons.push("@tier:high criterion present — full pipeline required");
    audit.checks.highTier = { pass: false };
    audit.mode = "pipeline";
    return { mode: "pipeline", reasons, audit };
  }
  audit.checks.highTier = { pass: true };

  if (normalized.length > max_files) {
    reasons.push(`file count ${normalized.length} exceeds max_files ${max_files}`);
    audit.checks.fileCount = { pass: false, count: normalized.length, max: max_files };
    audit.mode = "pipeline";
    return { mode: "pipeline", reasons, audit };
  }
  audit.checks.fileCount = { pass: true, count: normalized.length, max: max_files };

  const disallowed = normalized.filter((p) => !pathAllowed(p, allowed_prefixes));
  if (disallowed.length > 0) {
    reasons.push(`paths outside allowed_prefixes: ${disallowed.join(", ")}`);
    audit.checks.allowedPrefixes = { pass: false, disallowed, allowed_prefixes };
    audit.mode = "pipeline";
    return { mode: "pipeline", reasons, audit };
  }
  audit.checks.allowedPrefixes = { pass: true, allowed_prefixes };

  let referenceCount;
  let referenceDetail;
  if (typeof opts.referenceCount === "number") {
    referenceCount = opts.referenceCount;
    referenceDetail = { overridden: true };
  } else {
    const ref = countReferences(normalized, root);
    referenceDetail = ref;
    if (ref.skipped) {
      reasons.push("git unavailable for reference count — default pipeline");
      audit.checks.referenceCount = { pass: false, skipped: true };
      audit.mode = "pipeline";
      return { mode: "pipeline", reasons, audit };
    }
    referenceCount = ref.count;
  }

  audit.checks.referenceCount = {
    pass: referenceCount <= max_reference_count,
    count: referenceCount,
    max: max_reference_count,
    ...referenceDetail,
  };

  if (referenceCount > max_reference_count) {
    reasons.push(
      `reference count ${referenceCount} exceeds max_reference_count ${max_reference_count}`,
    );
    audit.mode = "pipeline";
    return { mode: "pipeline", reasons, audit };
  }

  if (require_additive) {
    let additive;
    let additiveDetail;
    if (typeof opts.additive === "boolean") {
      additive = opts.additive;
      additiveDetail = { overridden: true };
    } else {
      const add = checkAdditive(normalized, root, opts.baseRef);
      additiveDetail = add;
      if (add.skipped || add.additive === null) {
        reasons.push(
          add.reason
            ? `${add.reason} — default pipeline`
            : "additive check inconclusive — default pipeline",
        );
        audit.checks.additive = { pass: false, skipped: true, ...additiveDetail };
        audit.mode = "pipeline";
        return { mode: "pipeline", reasons, audit };
      }
      additive = add.additive;
    }

    audit.checks.additive = { pass: additive, ...additiveDetail };
    if (!additive) {
      reasons.push(additiveDetail?.reason || "non-additive change detected");
      audit.mode = "pipeline";
      return { mode: "pipeline", reasons, audit };
    }
  } else {
    audit.checks.additive = { pass: true, skipped: true };
  }

  reasons.push("all direct-mode criteria met");
  audit.mode = "direct";
  return { mode: "direct", reasons, audit };
}

function loadConfig(configPath) {
  if (!configPath || !existsSync(configPath)) return {};
  try {
    return JSON.parse(readFileSync(configPath, "utf8"));
  } catch {
    return {};
  }
}

function parseArgs(argv) {
  const args = argv.slice(2);
  const out = {
    paths: [],
    root: ".",
    audit: false,
    configPath: null,
    baseRef: process.env.TRIAGE_BASE_REF || null,
  };

  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (a === "--paths") {
      const val = args[++i] || "";
      out.paths.push(...val.split(",").map((s) => s.trim()).filter(Boolean));
    } else if (a === "--root") {
      out.root = args[++i] || ".";
    } else if (a === "--audit") {
      out.audit = true;
    } else if (a === "--config") {
      out.configPath = args[++i] || null;
    } else if (a === "--base-ref") {
      out.baseRef = args[++i] || null;
    } else if (a === "--help" || a === "-h") {
      out.help = true;
    }
  }
  return out;
}

async function readStdinPaths() {
  if (process.stdin.isTTY) return [];
  const chunks = [];
  for await (const chunk of process.stdin) chunks.push(chunk);
  const text = Buffer.concat(chunks).toString("utf8").trim();
  if (!text) return [];
  if (text.startsWith("[")) {
    try {
      const parsed = JSON.parse(text);
      if (Array.isArray(parsed)) return parsed.map(String);
    } catch {
      /* fall through */
    }
  }
  return text
    .split(/[\n,]/)
    .map((s) => s.trim())
    .filter(Boolean);
}

function appendAudit(root, auditLine) {
  const auditPath = path.join(root, "docs/triage-audit.jsonl");
  try {
    mkdirSync(path.dirname(auditPath), { recursive: true });
    appendFileSync(auditPath, `${JSON.stringify(auditLine)}\n`, "utf8");
    return auditPath;
  } catch {
    return null;
  }
}

async function main() {
  const cli = parseArgs(process.argv);
  if (cli.help) {
    console.log(`Usage: triage-change.mjs [--paths a.ts,b.ts] [--root .] [--audit] [--config tier2-v3.config.json]

Reads paths from --paths or stdin (one per line or comma-separated).
Outputs JSON: { mode, reasons, audit }`);
    process.exit(0);
  }

  const stdinPaths = await readStdinPaths();
  const paths = [...cli.paths, ...stdinPaths];
  const root = path.resolve(cli.root);
  const configPath =
    cli.configPath || path.join(root, "tier2-v3.config.json");
  const cfg = loadConfig(configPath);
  const triageCfg = cfg.triage || {};

  if (triageCfg.enabled === false) {
    const result = {
      mode: triageCfg.default_mode || "pipeline",
      reasons: ["triage.disabled in config"],
      audit: { timestamp: new Date().toISOString(), paths, disabled: true },
    };
    console.log(JSON.stringify(result, null, 2));
    process.exit(0);
  }

  const opts = {
    root,
    direct_mode: triageCfg.direct_mode,
    baseRef: cli.baseRef,
  };

  const result = triageChange(paths, opts);

  if (cli.audit) {
    const written = appendAudit(root, result.audit);
    if (written) result.audit.auditPath = written;
  }

  console.log(JSON.stringify(result, null, 2));
  process.exit(0);
}

const isMain = process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1]);
if (isMain) {
  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
