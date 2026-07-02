#!/usr/bin/env bash
# commitAndPush.sh — stage explicit files, commit, push, emit commit URL.
#
# Usage: bash commitAndPush.sh "<message>" <file1> [<file2> ...]
#
# Output on success (stdout):
#   sha=<commit-sha>
#   url=https://github.com/<owner>/<repo>/commit/<sha>
#
# Does NOT use `git add -A` — the caller MUST name every file to stage, so the
# skill never sweeps up unrelated uncommitted work. Does NOT skip hooks
# (no --no-verify); a hook failure surfaces as a non-zero exit.
#
# Exit 0 on success. Exit 1 on runtime errors. Exit 2 on usage errors.
#
# Requires: git, gh, jq.

set -euo pipefail

if [ $# -lt 2 ]; then
  printf '{"error":"Usage: commitAndPush.sh <message> <file1> [file2 ...]"}\n' >&2
  exit 2
fi

MSG="$1"; shift

if [ -z "$MSG" ]; then
  printf '{"error":"commit message cannot be empty"}\n' >&2
  exit 2
fi

for cmd in git gh jq; do
  if ! command -v "$cmd" >/dev/null 2>&1; then
    printf '{"error":"%s not found"}\n' "$cmd" >&2
    exit 1
  fi
done

# Verify each path either exists on disk or is tracked (handles deletions).
for path in "$@"; do
  if [ ! -e "$path" ] && ! git ls-files --error-unmatch -- "$path" >/dev/null 2>&1; then
    printf '{"error":"path not found and not tracked: %s"}\n' "$path" >&2
    exit 1
  fi
done

git add -- "$@"

if git diff --cached --quiet; then
  printf '{"error":"nothing staged after git add — check the listed files actually have changes"}\n' >&2
  exit 1
fi

git commit -m "$MSG"
git push

SHA="$(git rev-parse HEAD)"

REPO_JSON="$(gh repo view --json owner,name 2>/dev/null)" || {
  printf '{"error":"could not determine repository"}\n' >&2
  exit 1
}
OWNER="$(printf '%s' "$REPO_JSON" | jq -r '.owner.login')"
REPO="$(printf '%s' "$REPO_JSON" | jq -r '.name')"

if [ -z "$OWNER" ] || [ "$OWNER" = "null" ] || [ -z "$REPO" ] || [ "$REPO" = "null" ]; then
  printf '{"error":"failed to parse owner/repo from gh output"}\n' >&2
  exit 1
fi

printf 'sha=%s\n' "$SHA"
printf 'url=https://github.com/%s/%s/commit/%s\n' "$OWNER" "$REPO" "$SHA"
