#!/usr/bin/env bash
# fetchFailedLogs.sh — stream failed-step logs for every failing check on a PR.
#
# Usage: bash fetchFailedLogs.sh [pr-number]
#   pr-number: optional; defaults to the PR on the current branch.
#
# Output (plain text on stdout). First line is either:
#   # babysit-pr: no failing checks
# or:
#   # babysit-pr: failing checks
# followed by one delimited block per failing job:
#   # --- run=<id> job=<id> ---
#   <log body>
#
# Exit 0 on normal completion (with or without failures — caller checks the
# first line). Exit 1 on infrastructure errors (gh missing, not authed, no PR).
# Exit 2 on usage errors.
#
# Filter uses `bucket == "fail"` (gh CLI's normalized lowercase field) instead
# of `.conclusion` because the two gh APIs disagree on case —
# `gh pr view --json statusCheckRollup` returns UPPER (GraphQL enum),
# `gh run view --json jobs` returns lower (REST). `bucket` sidesteps it.
#
# Requires: gh, jq.

set -euo pipefail

if ! command -v gh >/dev/null 2>&1; then
  printf '{"error":"gh CLI not found"}\n' >&2
  exit 1
fi
if ! command -v jq >/dev/null 2>&1; then
  printf '{"error":"jq not found"}\n' >&2
  exit 1
fi
if ! gh api user --jq '.login' >/dev/null 2>&1; then
  printf '{"error":"not authenticated with GitHub — run: gh auth login"}\n' >&2
  exit 1
fi

PR_ARG="${1:-}"

if [ -n "$PR_ARG" ]; then
  if ! printf '%s' "$PR_ARG" | grep -qE '^[0-9]+$'; then
    printf '{"error":"invalid PR number: %s"}\n' "$PR_ARG" >&2
    exit 2
  fi
  ROLLUP="$(gh pr view "$PR_ARG" --json statusCheckRollup --jq '.statusCheckRollup' 2>/dev/null)" \
    || { printf '{"error":"could not fetch PR %s"}\n' "$PR_ARG" >&2; exit 1; }
else
  ROLLUP="$(gh pr view --json statusCheckRollup --jq '.statusCheckRollup' 2>/dev/null)" \
    || { printf '{"error":"no PR for current branch"}\n' >&2; exit 1; }
fi

RUN_IDS="$(printf '%s' "$ROLLUP" \
  | jq -r '.[] | select(.bucket == "fail") | .detailsUrl // empty' \
  | sed -nE 's#.*/runs/([0-9]+).*#\1#p' \
  | sort -u)"

if [ -z "$RUN_IDS" ]; then
  echo "# babysit-pr: no failing checks"
  exit 0
fi

echo "# babysit-pr: failing checks"
for RUN_ID in $RUN_IDS; do
  for JOB_ID in $(gh run view "$RUN_ID" --json jobs \
      --jq '.jobs[] | select(.conclusion == "failure") | .databaseId'); do
    echo ""
    echo "# --- run=$RUN_ID job=$JOB_ID ---"
    gh run view --job "$JOB_ID" --log-failed
  done
done
