#!/usr/bin/env bash

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
export MOCK_GRAPHQL_FIXTURE="${SCRIPT_DIR}/unresolvedPrComments.test.json"

gh() {
  if [ "$1 $2" = "api user" ]; then
    printf 'worker\n'
    return
  fi

  if [ "$1 $2" = "repo view" ]; then
    printf '{"owner":{"login":"ClipboardHealth"},"name":"core-utils"}\n'
    return
  fi

  if [ "$1 $2" = "api graphql" ]; then
    command cat "$MOCK_GRAPHQL_FIXTURE"
    return
  fi

  printf 'Unexpected gh invocation: %s\n' "$*" >&2
  return 1
}
export -f gh

actual="$(bash "${SCRIPT_DIR}/unresolvedPrComments.sh" 42)"

printf '%s' "$actual" | jq -e '
  (.threads | length) == 2
  and (.threads[0].comments[1].publicationState == "PENDING")
  and (.threads[0].comments[1].isBabysitSentinel == false)
  and (.threads[0].lastBabysitSentinelAt == null)
  and (.threads[0].activityState == "active")
  and (.threads[1].comments[1].publicationState == "SUBMITTED")
  and (.threads[1].comments[1].isBabysitSentinel == true)
  and (.threads[1].lastBabysitSentinelAt == "2026-07-29T11:05:00Z")
  and (.threads[1].activityState == "addressed")
  and (.activeThreads | map(.threadId)) == ["pending-thread"]
' >/dev/null

printf 'unresolvedPrComments tests passed\n'
