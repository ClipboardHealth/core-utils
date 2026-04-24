#!/usr/bin/env bash
# _sentinel.sh — shared SENTINEL constant + append helper.
# Sourced by unresolvedPrComments.sh, postSentinelReply.sh, postSentinelPrComment.sh.
# Keeping the sentinel in one place prevents a version bump from silently
# diverging between the posting scripts and the reader's recency detector.

SENTINEL='<!-- babysit-pr:addressed v1 -->'

# Echo $1 with the sentinel appended on its own trailing paragraph, unless
# the body already ends with the sentinel.
ensure_sentinel() {
  local body="$1"
  case "$body" in
    *"$SENTINEL") printf '%s' "$body" ;;
    *) printf '%s\n\n%s' "$body" "$SENTINEL" ;;
  esac
}
