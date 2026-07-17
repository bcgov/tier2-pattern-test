import { readFileSync, existsSync } from "node:fs";
import path from "node:path";

export function loadConfig(root = process.cwd()) {
  const jsonPath = path.join(root, "tier1.config.json");
  if (!existsSync(jsonPath)) {
    throw new Error(
      `Missing ${jsonPath}. Copy patterns/tier1/tier1.config.example.json → tier1.config.json (see ENROL.md).`,
    );
  }
  const cfg = JSON.parse(readFileSync(jsonPath, "utf8"));
  if (cfg.version !== 1) {
    throw new Error(`Unsupported tier1.config.json version: ${cfg.version}`);
  }
  return cfg;
}

export function repoRoot() {
  return process.env.GITHUB_WORKSPACE || process.env.TIER1_ROOT || process.cwd();
}
