#!/usr/bin/env bash
# _sentinel.sh — shared SENTINEL constants + append helper.
# Sourced by unresolvedPrComments.sh, postSentinelReply.sh, postSentinelPrComment.sh.
#
# SENTINEL_PREFIX is the version-agnostic substring used for matching/dedupe so
# pre-versioning sentinels (`<!-- babysit-pr:addressed v1 -->`) are still
# recognized alongside versioned ones. SENTINEL is the literal emitted on new
# replies; the `core@X.Y.Z` suffix records which plugin version produced it.

SENTINEL_PREFIX='<!-- babysit-pr:addressed v1 '
SENTINEL='<!-- babysit-pr:addressed v1 core@3.4.0 -->'

# Echo $1 with SENTINEL appended on its own trailing paragraph, unless the
# body already contains any version of the sentinel (matched via SENTINEL_PREFIX).
ensure_sentinel() {
  local body="$1"
  case "$body" in
    *"$SENTINEL_PREFIX"*) printf '%s' "$body" ;;
    *) printf '%s\n\n%s' "$body" "$SENTINEL" ;;
  esac
}
