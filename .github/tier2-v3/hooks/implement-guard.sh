#!/usr/bin/env bash
# Tier 2 v2 — block edits to protected paths during implementation sessions.
# Cursor beforeFileEdit hook; reads path from stdin JSON or env.
set -uo pipefail

if [[ "${TIER2_ALLOW_SPEC_EDIT:-}" == "1" ]]; then
  exit 0
fi

read_file_path() {
  local path=""

  path="${TIER2_GUARD_PATH:-${CURSOR_HOOK_FILE_PATH:-${FILE_PATH:-}}}"
  if [[ -n "$path" ]]; then
    printf '%s' "$path"
    return 0
  fi

  if [[ ! -t 0 ]]; then
    local input
    input="$(cat || true)"
    if [[ -n "$input" ]]; then
      path="$(
        printf '%s' "$input" | python3 -c "
import json
import sys

raw = sys.stdin.read()
if not raw.strip():
    sys.exit(0)

try:
    data = json.loads(raw)
except json.JSONDecodeError:
    sys.exit(0)

for key in ('file_path', 'path', 'filePath', 'file', 'target_path', 'targetPath'):
    value = data.get(key)
    if isinstance(value, str) and value:
        print(value)
        break
" 2>/dev/null || true
      )"
    fi
  fi

  printf '%s' "$path"
}

is_protected() {
  local p="${1#./}"

  case "$p" in
    spec/features/*|.github/workflows/*|.github/tier2-v3/scripts/*|constitution.md|tier2-v3.config.json)
      return 0
      ;;
  esac

  case "$p" in
    */spec/features/*|*/.github/workflows/*|*/.github/tier2-v3/scripts/*|*/constitution.md|*/tier2-v3.config.json)
      return 0
      ;;
  esac

  return 1
}

FILE_PATH="$(read_file_path)"

if [[ -z "$FILE_PATH" ]]; then
  exit 0
fi

if is_protected "$FILE_PATH"; then
  {
    echo "Tier 2 implement guard: blocked edit to protected path: $FILE_PATH"
    echo "Set TIER2_ALLOW_SPEC_EDIT=1 for spec/plan sessions, or edit via a human-reviewed PR."
  } >&2
  exit 2
fi

exit 0
