#!/usr/bin/env bash
# postSentinelReply.sh — Post a threaded reply to a PR review thread.
# The body MUST end with the babysit-pr sentinel; this script enforces that.
# Does NOT resolve the thread — that stays with the human.
#
# Usage: bash postSentinelReply.sh <thread-id> <body>
#   <thread-id>: GraphQL PullRequestReviewThread.id (from unresolvedPrComments.sh .threads[].threadId)
#   <body>: reply markdown. The sentinel will be appended if not already present.
#
# Requires: gh, jq. Prints reply URL on stdout, or a JSON {"error": "..."} on failure.

set -euo pipefail

SENTINEL='<!-- babysit-pr:addressed v1 -->'

if [ $# -lt 2 ]; then
  printf '{"error":"Usage: postSentinelReply.sh <thread-id> <body>"}\n' >&2
  exit 2
fi

THREAD_ID="$1"
BODY="$2"

if [ -z "$THREAD_ID" ]; then
  printf '{"error":"thread-id is required"}\n' >&2
  exit 2
fi
if [ -z "$BODY" ]; then
  printf '{"error":"body is required"}\n' >&2
  exit 2
fi

# Ensure sentinel is present at the end.
case "$BODY" in
  *"$SENTINEL") ;;
  *)
    BODY="${BODY}

${SENTINEL}"
    ;;
esac

MUTATION='
mutation($threadId: ID!, $body: String!) {
  addPullRequestReviewThreadReply(input: { pullRequestReviewThreadId: $threadId, body: $body }) {
    comment {
      id
      databaseId
      url
    }
  }
}'

result="$(gh api graphql \
  -f "query=${MUTATION}" \
  -f "threadId=${THREAD_ID}" \
  -f "body=${BODY}" 2>&1)" || {
  printf '{"error":%s}\n' "$(printf '%s' "$result" | jq -Rsc .)" >&2
  exit 1
}

url="$(printf '%s' "$result" | jq -r '.data.addPullRequestReviewThreadReply.comment.url // empty')"
if [ -z "$url" ]; then
  printf '{"error":"reply posted but no URL returned","raw":%s}\n' "$(printf '%s' "$result" | jq -c .)" >&2
  exit 1
fi

printf '%s\n' "$url"
