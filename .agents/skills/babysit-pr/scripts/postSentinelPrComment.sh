#!/usr/bin/env bash
# postSentinelPrComment.sh — Post a top-level PR comment (used for nitpick summaries).
# Appends the babysit-pr sentinel if missing.
#
# Usage: bash postSentinelPrComment.sh <pr-number> <body>
#
# Requires: gh, jq. Prints comment URL on stdout, or a JSON {"error": "..."} on failure.

set -euo pipefail

SENTINEL='<!-- babysit-pr:addressed v1 -->'

if [ $# -lt 2 ]; then
  printf '{"error":"Usage: postSentinelPrComment.sh <pr-number> <body>"}\n' >&2
  exit 2
fi

PR_NUMBER="$1"
BODY="$2"

if ! printf '%s' "$PR_NUMBER" | grep -qE '^[0-9]+$'; then
  printf '{"error":"Invalid PR number: %s"}\n' "$PR_NUMBER" >&2
  exit 2
fi
if [ -z "$BODY" ]; then
  printf '{"error":"body is required"}\n' >&2
  exit 2
fi

case "$BODY" in
  *"$SENTINEL") ;;
  *)
    BODY="${BODY}

${SENTINEL}"
    ;;
esac

repo_json="$(gh repo view --json owner,name 2>/dev/null)" || {
  printf '{"error":"Could not determine repository."}\n' >&2
  exit 1
}
owner="$(printf '%s' "$repo_json" | jq -r '.owner.login')"
repo="$(printf '%s' "$repo_json" | jq -r '.name')"

result="$(gh api "repos/${owner}/${repo}/issues/${PR_NUMBER}/comments" \
  --method POST \
  -f "body=${BODY}" 2>&1)" || {
  printf '{"error":%s}\n' "$(printf '%s' "$result" | jq -Rsc .)" >&2
  exit 1
}

url="$(printf '%s' "$result" | jq -r '.html_url // empty')"
if [ -z "$url" ]; then
  printf '{"error":"comment posted but no URL returned","raw":%s}\n' "$(printf '%s' "$result" | jq -c .)" >&2
  exit 1
fi

printf '%s\n' "$url"
