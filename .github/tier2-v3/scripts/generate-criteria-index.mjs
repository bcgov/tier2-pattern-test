#!/usr/bin/env node
/**
 * Generate spec/criteria-index.json from Gherkin feature files.
 * Single source for criterion IDs, tiers, and feature paths — used by metrics & coverage.
 *
 * Usage: node generate-criteria-index.mjs --root .
 */
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

function arg(name, fallback) {
  const i = process.argv.indexOf(`--${name}`);
  if (i === -1) return fallback;
  return process.argv[i + 1] ?? fallback;
}

/**
 * @returns {{ generatedAt: string, criteria: Array<{id: string, feature: string, scenario: string, tier: string|null}> }}
 */
export function buildCriteriaIndex(root = ".") {
  const dirCandidates = [
    path.join(root, "spec/features"),
    path.join(root, "bundle/spec/features"),
  ];
  let dir = null;
  let prefix = "spec/features";
  for (const d of dirCandidates) {
    if (existsSync(d)) {
      dir = d;
      prefix = path.relative(root, d).replace(/\\/g, "/") || "spec/features";
      break;
    }
  }
  const criteria = [];
  if (!dir) {
    return { generatedAt: new Date().toISOString(), criteria };
  }

  for (const file of readdirSync(dir).filter((f) => f.endsWith(".feature"))) {
    const rel = `${prefix}/${file}`;
    const lines = readFileSync(path.join(dir, file), "utf8").split("\n");
    let pendingTags = [];
    for (let i = 0; i < lines.length; i++) {
      const trimmed = lines[i].trim();
      if (!trimmed || trimmed.startsWith("#")) {
        if (trimmed.startsWith("#")) pendingTags = [];
        continue;
      }
      if (/^@[\w:-]+/.test(trimmed)) {
        pendingTags.push(...trimmed.split(/\s+/).filter((t) => t.startsWith("@")));
        continue;
      }
      const scenario = lines[i].match(/^\s*Scenario(?: Outline)?:\s*(.+)$/);
      if (scenario) {
        const idTag = pendingTags.find((t) => /^@R-\d+\.\d+$/.test(t));
        const tierTag = pendingTags.find((t) => /^@tier:/i.test(t));
        if (idTag) {
          criteria.push({
            id: idTag.slice(1),
            feature: rel.startsWith("bundle/") ? rel.replace(/^bundle\//, "") : rel,
            scenario: scenario[1].trim(),
            tier: tierTag ? tierTag.replace(/^@tier:/i, "").toLowerCase() : null,
          });
        }
        pendingTags = [];
      } else if (!trimmed.startsWith("@")) {
        pendingTags = [];
      }
    }
  }

  return { generatedAt: new Date().toISOString(), criteria };
}

export function writeCriteriaIndex(root = ".", outRel = "spec/criteria-index.json") {
  const index = buildCriteriaIndex(root);
  const outPath = path.join(root, outRel);
  mkdirSync(path.dirname(outPath), { recursive: true });
  writeFileSync(outPath, `${JSON.stringify(index, null, 2)}\n`);
  return { outPath, index };
}

const __filename = fileURLToPath(import.meta.url);
const isMain = process.argv[1] && path.resolve(process.argv[1]) === __filename;

if (isMain) {
  const root = path.resolve(arg("root", "."));
  const { outPath, index } = writeCriteriaIndex(root);
  console.log(`Wrote ${outPath} (${index.criteria.length} criteria)`);
}
