#!/usr/bin/env bash
# _sentinel.sh — shared SENTINEL constants + append helper.
# Sourced by unresolvedPrComments.sh, postSentinelReply.sh, postSentinelPrComment.sh.
# Keeping the sentinel in one place prevents a version bump from silently
# diverging between the posting scripts and the reader's recency detector.
#
# Two values are exported:
#   SENTINEL_PREFIX — version-agnostic substring used for matching/dedupe so
#     pre-versioning sentinels (`<!-- babysit-pr:addressed v1 -->`) are still
#     recognized alongside versioned ones.
#   SENTINEL — full string emitted on new replies, with the current
#     plugins/core/.claude-plugin/plugin.json version stamped as `core@X.Y.Z`.

SENTINEL_PREFIX='<!-- babysit-pr:addressed v1 '

__sentinel_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
__plugin_json="${__sentinel_dir}/../../../.claude-plugin/plugin.json"
if [ -r "$__plugin_json" ]; then
  __plugin_version="$(jq -r '.version // "unknown"' "$__plugin_json" 2>/dev/null || printf 'unknown')"
else
  __plugin_version="unknown"
fi
SENTINEL="<!-- babysit-pr:addressed v1 core@${__plugin_version} -->"
unset __sentinel_dir __plugin_json __plugin_version

# Echo $1 with SENTINEL appended on its own trailing paragraph, unless the
# body already contains any version of the sentinel (matched via SENTINEL_PREFIX).
ensure_sentinel() {
  local body="$1"
  case "$body" in
    *"$SENTINEL_PREFIX"*) printf '%s' "$body" ;;
    *) printf '%s\n\n%s' "$body" "$SENTINEL" ;;
  esac
}
