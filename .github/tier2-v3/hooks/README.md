# Tier 2 v2 — local implement guard (Cursor hooks)

Optional **beforeFileEdit** hook that blocks agent edits to protected paths during **implementation** sessions. Spec/plan work lifts the guard with `TIER2_ALLOW_SPEC_EDIT=1` (see `.github/tier2-v3/LOCAL.md`).

## Protected paths

- `spec/features/**`
- `.github/workflows/**`
- `.github/tier2-v3/scripts/**`
- `constitution.md`
- `tier2-v3.config.json`

## Install (once per clone)

From the enrolled service repo root:

```bash
mkdir -p .cursor/hooks
cp .github/tier2-v3/hooks/implement-guard.sh .cursor/hooks/
chmod +x .cursor/hooks/implement-guard.sh
```

Merge the hook entry into `.cursor/hooks.json` (create the file if missing):

```json
{
  "version": 1,
  "hooks": {
    "beforeFileEdit": [{ "command": ".cursor/hooks/implement-guard.sh" }]
  }
}
```

If you already have hooks, add the `beforeFileEdit` array entry without removing other events. See `hooks.json.example` in this directory.

Reload Cursor (or save `hooks.json`) and confirm the hook appears under **Cursor Settings → Hooks**.

## Session modes

| Mode | Env | Behaviour |
| --- | --- | --- |
| **Implementation** (default) | unset | Blocks protected paths |
| **Spec / plan** | `TIER2_ALLOW_SPEC_EDIT=1` | Allows all paths |

Example spec session:

```bash
export TIER2_ALLOW_SPEC_EDIT=1
# start your local coding agent in this shell
```

## Manual test

```bash
echo '{"file_path":"spec/features/example.feature"}' | .cursor/hooks/implement-guard.sh
# exit 2 + message

TIER2_ALLOW_SPEC_EDIT=1 echo '{"file_path":"spec/features/example.feature"}' | .cursor/hooks/implement-guard.sh
# exit 0
```

## References

- Pack ops: `.github/tier2-v3/LOCAL.md`
- Cursor hooks: [create-hook skill](https://cursor.com/docs) / project `.cursor/hooks.json`
