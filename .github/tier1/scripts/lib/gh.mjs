import { execFileSync } from "node:child_process";

export function gh(args, { input, ignoreError = false } = {}) {
  try {
    return execFileSync("gh", args, {
      encoding: "utf8",
      input,
      stdio: ["pipe", "pipe", "pipe"],
      env: process.env,
    }).trim();
  } catch (err) {
    if (ignoreError) return "";
    const stderr = err.stderr?.toString?.() || err.message;
    throw new Error(`gh ${args.join(" ")} failed: ${stderr}`);
  }
}

export function ensureLabel(name, color = "CCCCCC", description = "") {
  const list = gh(["label", "list", "--json", "name"], { ignoreError: true });
  if (list) {
    try {
      const names = JSON.parse(list).map((l) => l.name);
      if (names.includes(name)) return;
    } catch {
      /* create below */
    }
  }
  gh(
    [
      "label",
      "create",
      name,
      "--color",
      color.replace(/^#/, ""),
      "--description",
      description || name,
      "--force",
    ],
    { ignoreError: true },
  );
}
