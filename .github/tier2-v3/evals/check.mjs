#!/usr/bin/env node
/**
 * Run harness eval checks against a mock or captured agent result file.
 *
 * Usage:
 *   node check.mjs --result path/to/result.json --task path/to/task.json
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

export function parseArgs(argv = process.argv.slice(2)) {
  const out = { resultPath: null, taskPath: null };
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === "--result") out.resultPath = argv[++i];
    else if (argv[i] === "--task") out.taskPath = argv[++i];
  }
  return out;
}

export function loadJson(path) {
  return JSON.parse(readFileSync(path, "utf8"));
}

/**
 * @param {{ output?: string, files?: Record<string, string> }} result
 * @param {{ id: string, checks: Array<{ type: string, value: string, file?: string }> }} task
 */
export function runChecks(result, task) {
  const output = result.output ?? "";
  const files = result.files ?? {};
  const details = [];

  for (const check of task.checks) {
    const needle = check.value;
    let pass = false;
    let detail = "";

    switch (check.type) {
      case "output_contains":
        pass = output.toLowerCase().includes(needle.toLowerCase());
        detail = pass ? "found in output" : "missing from output";
        break;
      case "output_not_contains":
        pass = !output.toLowerCase().includes(needle.toLowerCase());
        detail = pass ? "absent from output" : "found in output (forbidden)";
        break;
      case "file_contains": {
        const targets = check.file
          ? [[check.file, files[check.file] ?? ""]]
          : Object.entries(files);
        pass = targets.some(([, content]) =>
          (content ?? "").toLowerCase().includes(needle.toLowerCase()),
        );
        detail = pass
          ? `found in ${check.file ?? "files"}`
          : `missing from ${check.file ?? "files"}`;
        break;
      }
      default:
        pass = false;
        detail = `unknown check type: ${check.type}`;
    }

    details.push({ check, pass, detail });
  }

  return {
    taskId: task.id,
    pass: details.every((d) => d.pass),
    details,
  };
}

function main() {
  const { resultPath, taskPath } = parseArgs();
  if (!resultPath || !taskPath) {
    console.error("Usage: node check.mjs --result <path> --task <path>");
    process.exit(2);
  }

  const result = loadJson(resultPath);
  const task = loadJson(taskPath);
  const outcome = runChecks(result, task);

  for (const d of outcome.details) {
    const label = `${d.check.type} "${d.check.value}"`;
    console.log(`${d.pass ? "PASS" : "FAIL"}  ${label} — ${d.detail}`);
  }
  console.log(`\nTask ${task.id}: ${outcome.pass ? "PASS" : "FAIL"}`);
  process.exit(outcome.pass ? 0 : 1);
}

const isMain =
  process.argv[1] &&
  fileURLToPath(import.meta.url) === path.resolve(process.argv[1]);
if (isMain) main();
