#!/usr/bin/env node
/**
 * Table-driven tests for triage-change.mjs (no git required).
 */
import { triageChange, parseHighTierTagLines } from "./triage-change.mjs";

const tagCases = [
  {
    name: "parseHighTierTagLines ignores comment mentions",
    body: "  # Add @tier:high when needed\n  @R-00.1\n  Scenario: x",
    want: false,
  },
  {
    name: "parseHighTierTagLines detects real tag",
    body: "  @tier:high @R-00.1\n  Scenario: x",
    want: true,
  },
];

let passed = 0;
let failed = 0;

for (const tc of tagCases) {
  const got = parseHighTierTagLines(tc.body);
  if (got === tc.want) {
    passed++;
    console.log(`PASS  ${tc.name}`);
  } else {
    failed++;
    console.log(`FAIL  ${tc.name} (got ${got}, want ${tc.want})`);
  }
}

const cases = [
  {
    name: "empty paths → pipeline",
    paths: [],
    opts: {},
    wantMode: "pipeline",
    wantReasonIncludes: "no implementation paths",
  },
  {
    name: "single allowed path, low refs, additive → direct",
    paths: ["src/foo.ts"],
    opts: { referenceCount: 0, additive: true },
    wantMode: "direct",
  },
  {
    name: "too many files → pipeline",
    paths: ["src/a.ts", "src/b.ts", "src/c.ts", "src/d.ts"],
    opts: { referenceCount: 0, additive: true },
    wantMode: "pipeline",
    wantReasonIncludes: "file count",
  },
  {
    name: "exactly max_files (3) → direct",
    paths: ["src/a.ts", "src/b.ts", "src/c.ts"],
    opts: { referenceCount: 1, additive: true },
    wantMode: "direct",
  },
  {
    name: "path outside allowed_prefixes → pipeline",
    paths: ["deploy/k8s.yaml"],
    opts: { referenceCount: 0, additive: true },
    wantMode: "pipeline",
    wantReasonIncludes: "allowed_prefixes",
  },
  {
    name: "spec path outside allowed → pipeline",
    paths: ["spec/spec.md"],
    opts: { referenceCount: 0, additive: true },
    wantMode: "pipeline",
    wantReasonIncludes: "allowed_prefixes",
  },
  {
    name: "reference count too high → pipeline",
    paths: ["src/foo.ts"],
    opts: { referenceCount: 5, additive: true },
    wantMode: "pipeline",
    wantReasonIncludes: "reference count",
  },
  {
    name: "reference count at threshold (2) → direct",
    paths: ["src/foo.ts"],
    opts: { referenceCount: 2, additive: true },
    wantMode: "direct",
  },
  {
    name: "non-additive → pipeline",
    paths: ["src/foo.ts"],
    opts: { referenceCount: 0, additive: false },
    wantMode: "pipeline",
    wantReasonIncludes: "non-additive",
  },
  {
    name: "apps/ prefix allowed → direct",
    paths: ["apps/web/main.ts"],
    opts: { referenceCount: 0, additive: true },
    wantMode: "direct",
  },
  {
    name: "custom allowed_prefixes",
    paths: ["lib/util.ts"],
    opts: {
      referenceCount: 0,
      additive: true,
      direct_mode: { allowed_prefixes: ["lib/"] },
    },
    wantMode: "direct",
  },
  {
    name: "custom max_files=1 blocks two files",
    paths: ["src/a.ts", "src/b.ts"],
    opts: {
      referenceCount: 0,
      additive: true,
      direct_mode: { max_files: 1 },
    },
    wantMode: "pipeline",
    wantReasonIncludes: "file count",
  },
  {
    name: "mixed allowed and disallowed → pipeline",
    paths: ["src/a.ts", "deploy/x.yaml"],
    opts: { referenceCount: 0, additive: true },
    wantMode: "pipeline",
    wantReasonIncludes: "allowed_prefixes",
  },
  {
    name: "@tier:high override forces pipeline",
    paths: ["src/foo.ts"],
    opts: { referenceCount: 0, additive: true, highTier: true },
    wantMode: "pipeline",
    wantReasonIncludes: "@tier:high",
  },
  {
    name: "unrelated src change without highTier override → direct",
    paths: ["src/foo.ts"],
    opts: { referenceCount: 0, additive: true, highTier: false },
    wantMode: "direct",
  },
];

for (const tc of cases) {
  const result = triageChange(tc.paths, tc.opts);
  let ok = result.mode === tc.wantMode;
  if (ok && tc.wantReasonIncludes) {
    ok = result.reasons.some((r) => r.includes(tc.wantReasonIncludes));
  }
  if (ok) {
    passed++;
    console.log(`PASS  ${tc.name}`);
  } else {
    failed++;
    console.log(`FAIL  ${tc.name}`);
    console.log(`      want mode=${tc.wantMode}, got mode=${result.mode}`);
    console.log(`      reasons: ${JSON.stringify(result.reasons)}`);
  }
}

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
