#!/usr/bin/env bash
# _sentinel.sh — shared SENTINEL constants + append helper.
# Sourced by unresolvedPrComments.sh, postSentinelReply.sh, postSentinelPrComment.sh.
#
# SENTINEL_PREFIX is the version-agnostic substring used for matching/dedupe.
# It deliberately carries no wrapper (no `<!--`, no `<sub>`) so it matches BOTH
# the legacy hidden-comment sentinels (`<!-- babysit-pr:addressed v1 ... -->`)
# and the current visible footer below — pre-versioning and pre-visibility
# replies stay recognized. SENTINEL is the literal emitted on new replies: a
# human-visible footer (a robot mark plus the machine token in an inline
# `<code>` span, wrapped in `<sub>` so it renders small) so reviewers can see an
# agent posted the reply, while dedupe still works off the embedded token. The
# `core@X.Y.Z` suffix records the plugin version (substituted at build time by
# embedPluginVersion.mts).

SENTINEL_PREFIX='babysit-pr:addressed v1 '
SENTINEL='<sub>🤖 <code>babysit-pr:addressed v1 core@3.4.1</code></sub>'

# Bot author allowlist (JSON array literal). Used by unresolvedPrComments.sh
# as a fallback when GraphQL's `author.__typename == "Bot"` misses a GitHub
# App that posts via a User-type service account. Single source of truth so
# adding a new bot is a one-line edit.
BOTS_JSON='["coderabbitai","coderabbitai[bot]","mendral-app","mendral-app[bot]","dependabot","dependabot[bot]","github-actions","github-actions[bot]","github-advanced-security","github-advanced-security[bot]","renovate","renovate[bot]","renovate-bot","pre-commit-ci","pre-commit-ci[bot]","codecov","codecov[bot]","sonarcloud","sonarcloud[bot]"]'

# Echo $1 with SENTINEL appended on its own trailing paragraph, unless the
# body already contains any version of the sentinel (matched via SENTINEL_PREFIX).
ensure_sentinel() {
  local body="$1"
  case "$body" in
    *"$SENTINEL_PREFIX"*) printf '%s' "$body" ;;
    *) printf '%s\n\n%s' "$body" "$SENTINEL" ;;
  esac
}
