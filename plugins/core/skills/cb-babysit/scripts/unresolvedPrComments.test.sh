#!/usr/bin/env bash

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
export MOCK_GRAPHQL_FIXTURE="${SCRIPT_DIR}/unresolvedPrComments.test.json"

gh() {
  if [ "$1 $2" = "api user" ]; then
    printf 'agent\n'
    return
  fi

  if [ "$1 $2" = "repo view" ]; then
    printf '{"owner":{"login":"acme"},"name":"widgets"}\n'
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
  (.threads | length) == 3
  and (.threads[0].activityKey == "thread:T_addressed:C_addressed")
  and (.threads[0].activityState == "addressed")
  and (.threads[0].url == "https://github.com/acme/widgets/pull/42#discussion_r1")
  and (.threads[1].activityKey == "thread:T_bot:C_bot_new")
  and (.threads[1].activityState == "uncertain")
  and (.threads[1].postSentinelBotComments | map(.id)) == ["C_bot_new"]
  and (.threads[2].activityKey == "thread:T_human:C_human_new")
  and (.threads[2].activityState == "active")
  and (.threads[2].postSentinelHumanComments | map(.id)) == ["C_human_new"]
  and (.activeThreads | map(.threadId)) == ["T_bot", "T_human"]
  and (.totalUnresolvedComments == 4)
' >/dev/null
