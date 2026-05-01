#!/usr/bin/env bash
# find-session-id.sh — print the current agent session ID, or nothing.
# Output format on success: "<agent> <id>" (e.g. "codex 0193..." or "claude-code c8fb7000-...").
# Exits 0 either way; callers should treat empty output as "unknown, skip the line".
#
# Codex: reads $CODEX_THREAD_ID directly.
# Claude Code: greps the project's JSONL transcripts for a phrase the caller
#   passes as $1. The phrase MUST come from a recent user message in the
#   current session and MUST avoid: " ' \ tab newline (those are JSON-escaped
#   on disk or break shell quoting). Non-ASCII is fine — Claude Code stores
#   user messages verbatim, not as \uXXXX escapes.
#
# Usage: find-session-id.sh "<distinctive phrase>"

set -euo pipefail

if [ -n "${CODEX_THREAD_ID:-}" ]; then
  echo "codex $CODEX_THREAD_ID"
  exit 0
fi

phrase="${1:-}"
[ -n "$phrase" ] || exit 0

# Claude Code encodes both / and . as - in the project-dir name
# (e.g. /Users/x/.claude → -Users-x--claude).
project_dir="$HOME/.claude/projects/$(pwd | sed -e 's|/|-|g' -e 's|\.|-|g')"
[ -d "$project_dir" ] || exit 0

# -- guards against a phrase that starts with -. -m 1 stops scanning each
# transcript at the first hit (transcripts can be hundreds of MB).
matches=$(grep -lFm 1 -- "$phrase" "$project_dir"/*.jsonl 2>/dev/null || true)
[ -n "$matches" ] || exit 0

# Require exactly one match. Falling back to recency under multi-match would
# risk a wrong ID when concurrent sessions exist in the same project.
[ "$(printf '%s\n' "$matches" | wc -l)" -eq 1 ] || exit 0

echo "claude-code $(basename "$matches" .jsonl)"
