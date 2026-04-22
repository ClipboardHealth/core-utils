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

FAILING_RAW="$(printf '%s' "$ROLLUP" \
  | jq -r '.[] | select(.bucket == "fail") | [.name // "unknown", .detailsUrl // ""] | @tsv')"

if [ -z "$FAILING_RAW" ]; then
  echo "# babysit-pr: no failing checks"
  exit 0
fi

# Partition into GitHub-Actions runs (we can fetch --log-failed) vs external
# checks (CircleCI, Nx Cloud, semgrep, CodeRabbit, Devin, etc. — no inline logs).
RUN_IDS=""
EXTERNAL_BLOCK=""
while IFS=$'\t' read -r NAME URL; do
  [ -z "$NAME" ] && continue
  # Match GitHub Actions run URLs specifically. A loose `.*/runs/([0-9]+)` would
  # misclassify Nx Cloud (`cloud.nx.app/runs/<numeric>`) and other hosts that
  # reuse the `/runs/` path as GitHub Actions runs.
  RUN_ID="$(printf '%s' "$URL" | sed -nE 's#^https://github\.com/[^/]+/[^/]+/actions/runs/([0-9]+).*#\1#p')"
  if [ -n "$RUN_ID" ]; then
    RUN_IDS="$RUN_IDS $RUN_ID"
  else
    EXTERNAL_BLOCK="${EXTERNAL_BLOCK}"$'\n'"# --- external check: ${NAME} (${URL:-no URL}) ---"
  fi
done <<EOF
$FAILING_RAW
EOF
RUN_IDS="$(printf '%s\n' $RUN_IDS | sort -u | tr '\n' ' ')"

echo "# babysit-pr: failing checks"

for RUN_ID in $RUN_IDS; do
  for JOB_ID in $(gh run view "$RUN_ID" --json jobs \
      --jq '.jobs[] | select(.conclusion == "failure") | .databaseId'); do
    echo ""
    echo "# --- run=$RUN_ID job=$JOB_ID ---"
    gh run view --job "$JOB_ID" --log-failed
  done
done

if [ -n "$EXTERNAL_BLOCK" ]; then
  printf '%s\n' "$EXTERNAL_BLOCK"
  echo ""
  echo "# (no inline logs available for external checks — investigate via the URLs above;"
  echo "#  treat these like \"External checks with no inspectable logs\" in step 5's guidance)"
fi
