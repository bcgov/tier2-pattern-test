#!/usr/bin/env node
/**
 * Generate PR evidence skeleton.
 *
 * Default: refuse to overwrite an existing docs/pr-evidence.md (prevents wiping prior slices).
 * Append a new section:
 *   node generate.mjs --root . --finding AUTH-001 --title "Enable PKCE" --append
 * Force overwrite (rare):
 *   node generate.mjs --root . --force
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

function arg(name, fallback) {
  const i = process.argv.indexOf(`--${name}`);
  return i === -1 ? fallback : process.argv[i + 1];
}

function hasFlag(name) {
  return process.argv.includes(`--${name}`);
}

const root = path.resolve(arg("root", "."));
const out = path.resolve(root, arg("out", "docs/pr-evidence.md"));
const append = hasFlag("append");
const force = hasFlag("force");
const finding = arg("finding", "");
const titleArg = arg("title", "");
const template = readFileSync(path.join(__dirname, "EVIDENCE.md.template"), "utf8");

function listFeatures() {
  const dir = path.join(root, "spec/features");
  if (!existsSync(dir)) return [];
  return readdirSync(dir).filter((f) => f.endsWith(".feature"));
}

const features = listFeatures();
const scenarioRows =
  features.length === 0
    ? "| _(no feature files found)_ | | |"
    : features.map((f) => `| \`${f}\` | TODO | |`).join("\n");

const headingTitle = finding
  ? `[RA ${finding.toUpperCase()}] ${titleArg || finding.toUpperCase()}`
  : titleArg || path.basename(root);

const filled = template
  .replaceAll("{{TITLE}}", headingTitle)
  .replaceAll("{{BRANCH}}", arg("branch", process.env.GITHUB_HEAD_REF || process.env.GITHUB_REF_NAME || "local"))
  .replaceAll("{{SPEC_REFS}}", features.length ? features.map((f) => `spec/features/${f}`).join(", ") : "spec/spec.md")
  .replaceAll("{{CONSTITUTION_REFS}}", "P1–P8 (confirm)")
  .replaceAll("{{TASK_REFS}}", "see spec/tasks.md")
  .replaceAll("{{AGENT}}", arg("agent", "unspecified"))
  .replaceAll("{{GENERATED_AT}}", new Date().toISOString())
  .replaceAll("{{INTENT}}", "_Summarize user-visible change in 2–3 sentences._")
  .replaceAll("{{SCENARIO_ROWS}}", scenarioRows)
  .replaceAll("{{DS_COMPONENTS}}", "_e.g. Button, TextField, Header — from Design System MCP_")
  .replaceAll("{{DS_TOKENS}}", "_list or 'via components'_")
  .replaceAll("{{BC_SANS}}", "TODO")
  .replaceAll("{{A11Y_NOTES}}", "TODO")
  .replaceAll("{{MINIMUMS_IDS}}", "_e.g. A11Y-02, A11Y-04_")
  .replaceAll("{{UNIT}}", "TODO")
  .replaceAll("{{ACCEPTANCE}}", features.map((f) => `spec/features/${f}`).join(", ") || "TODO")
  .replaceAll("{{A11Y_CI}}", "TODO")
  .replaceAll("{{RISKS}}", "_None noted / …_");

mkdirSync(path.dirname(out), { recursive: true });

if (existsSync(out) && !append && !force) {
  console.error(
    `Refusing to overwrite ${out} (would wipe prior slice evidence).\n` +
      `Use --append --finding ID [--title "..."] to add a section, or --force to replace.`,
  );
  process.exit(1);
}

if (append && existsSync(out)) {
  const prev = readFileSync(out, "utf8").trimEnd();
  writeFileSync(out, `${prev}\n\n---\n\n${filled.trimStart()}`);
  console.log(`Appended section to ${out}`);
} else {
  writeFileSync(out, filled);
  console.log(`Wrote ${out}`);
}
