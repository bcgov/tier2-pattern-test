# Agent PR evidence pack

Compact report agents attach to draft PRs so humans can review against **spec + constitution**, not vibe.

## Contents

| File | Role |
| --- | --- |
| [`EVIDENCE.md.template`](EVIDENCE.md.template) | Markdown template for `docs/pr-evidence.md` or PR body |
| [`generate.mjs`](generate.mjs) | Fills a skeleton from git + spec paths |

## Generate

**Append-only by default** — if `docs/pr-evidence.md` already exists, the generator refuses to overwrite it (prevents wiping prior slices).

```bash
# First slice (file does not exist yet)
node packs/pr-evidence/generate.mjs --root /path/to/service --finding AUTH-001 --title "Enable PKCE"

# Later slices — always append
node packs/pr-evidence/generate.mjs --root /path/to/service --finding LOG-002 --title "Raise auth log levels" --append

# Rare: replace entire file
node packs/pr-evidence/generate.mjs --root /path/to/service --force
```

Agents should update the Design System / test sections and fill the **Review receipt** (Checked / Could not check / Residual risk) after implementation — same shape as `REVIEW.md`.
