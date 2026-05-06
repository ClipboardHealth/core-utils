#!/usr/bin/env bash
# _sentinel.sh — shared SENTINEL constants + append helper.
# Sourced by unresolvedPrComments.sh, postSentinelReply.sh, postSentinelPrComment.sh.
#
# The SENTINEL literal below is rewritten at build time by
# scripts/embedPluginVersion.ts (invoked from `node --run sync-ai-rules`)
# so the version stays correct without any runtime path resolution to
# plugin.json — the skill is agent-agnostic and works under Codex,
# Claude Code, or any host that bundles only the skill files.
#
# Two values are exported:
#   SENTINEL_PREFIX — version-agnostic substring used for matching/dedupe so
#     pre-versioning sentinels (`<!-- babysit-pr:addressed v1 -->`) are still
#     recognized alongside versioned ones.
#   SENTINEL — full string emitted on new replies. The `core@X.Y.Z` suffix
#     is the plugins/core version embedded at build time.

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
