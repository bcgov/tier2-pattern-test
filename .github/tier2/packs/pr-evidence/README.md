# Agent PR evidence pack

Compact report agents attach to draft PRs so humans can review against **spec + constitution**, not vibe.

## Contents

| File | Role |
| --- | --- |
| [`EVIDENCE.md.template`](EVIDENCE.md.template) | Markdown template for `docs/pr-evidence.md` or PR body |
| [`generate.mjs`](generate.mjs) | Fills a skeleton from git + spec paths |

## Generate

```bash
node packs/pr-evidence/generate.mjs --root /path/to/service --out docs/pr-evidence.md
```

Agents should update the Design System / test sections after implementation.
