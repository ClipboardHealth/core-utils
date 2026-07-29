#!/usr/bin/env bash
# postSentinelReply.sh — Post a threaded reply to a PR review thread.
# The body MUST end with the cb-babysit sentinel; this script enforces that.
# Does NOT resolve the thread — that stays with the human.
#
# Usage: bash postSentinelReply.sh <owner> <repo> <pr-number> <top-level-comment-id> <body>
#   <owner>, <repo>, <pr-number>: repository and pull request from unresolvedPrComments.sh.
#   <top-level-comment-id>: unresolvedPrComments.sh .threads[].replyToCommentDatabaseId.
#   <body>: reply markdown. The sentinel will be appended if not already present.
#
# Requires: gh, jq. Prints the verified published reply URL on stdout, or a
# JSON {"error": "..."} on failure.

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
# shellcheck source=_sentinel.sh
source "${SCRIPT_DIR}/_sentinel.sh"

if [ $# -lt 5 ]; then
  printf '{"error":"Usage: postSentinelReply.sh <owner> <repo> <pr-number> <top-level-comment-id> <body>"}\n' >&2
  exit 2
fi

OWNER="$1"
REPO="$2"
PR_NUMBER="$3"
TOP_LEVEL_COMMENT_ID="$4"
BODY="$5"

if [ -z "$OWNER" ]; then
  printf '{"error":"owner is required"}\n' >&2
  exit 2
fi
if [ -z "$REPO" ]; then
  printf '{"error":"repo is required"}\n' >&2
  exit 2
fi
if ! printf '%s' "$PR_NUMBER" | grep -qE '^[1-9][0-9]*$'; then
  printf '{"error":"pr-number must be a positive integer"}\n' >&2
  exit 2
fi
if ! printf '%s' "$TOP_LEVEL_COMMENT_ID" | grep -qE '^[1-9][0-9]*$'; then
  printf '{"error":"top-level-comment-id must be a positive integer"}\n' >&2
  exit 2
fi
if [ -z "$BODY" ]; then
  printf '{"error":"body is required"}\n' >&2
  exit 2
fi

BODY="$(ensure_sentinel "$BODY")"

create_endpoint="repos/${OWNER}/${REPO}/pulls/${PR_NUMBER}/comments/${TOP_LEVEL_COMMENT_ID}/replies"
result="$(gh api --method POST "$create_endpoint" -f "body=${BODY}" 2>&1)" || {
  printf '{"error":%s}\n' "$(printf '%s' "$result" | jq -Rsc .)" >&2
  exit 1
}

reply_id="$(printf '%s' "$result" | jq -r '.id // empty')"
review_id="$(printf '%s' "$result" | jq -r '.pull_request_review_id // empty')"
url="$(printf '%s' "$result" | jq -r '.html_url // empty')"
if ! printf '%s' "$reply_id" | grep -qE '^[1-9][0-9]*$' ||
  ! printf '%s' "$review_id" | grep -qE '^[1-9][0-9]*$' ||
  [ -z "$url" ]; then
  printf '{"error":"reply API returned an incomplete review comment","raw":%s}\n' \
    "$(printf '%s' "$result" | jq -c .)" >&2
  exit 1
fi

verify_comment_endpoint="repos/${OWNER}/${REPO}/pulls/comments/${reply_id}"
verified_comment="$(gh api "$verify_comment_endpoint" 2>&1)" || {
  printf '{"error":%s}\n' "$(printf '%s' "$verified_comment" | jq -Rsc .)" >&2
  exit 1
}

if ! printf '%s' "$verified_comment" | jq -e \
  --arg body "$BODY" \
  --argjson reply_id "$reply_id" \
  --argjson review_id "$review_id" \
  --argjson top_level_comment_id "$TOP_LEVEL_COMMENT_ID" \
  '
    .id == $reply_id
    and .pull_request_review_id == $review_id
    and .in_reply_to_id == $top_level_comment_id
    and .body == $body
    and ((.html_url // "") != "")
  ' >/dev/null; then
  printf '{"error":"created reply could not be verified","raw":%s}\n' \
    "$(printf '%s' "$verified_comment" | jq -c .)" >&2
  exit 1
fi

verify_review_endpoint="repos/${OWNER}/${REPO}/pulls/${PR_NUMBER}/reviews/${review_id}"
verified_review="$(gh api "$verify_review_endpoint" 2>&1)" || {
  printf '{"error":%s}\n' "$(printf '%s' "$verified_review" | jq -Rsc .)" >&2
  exit 1
}

if ! printf '%s' "$verified_review" | jq -e \
  --argjson review_id "$review_id" \
  '
    .id == $review_id
    and ((.state // "") != "")
    and .state != "PENDING"
    and ((.submitted_at // "") != "")
  ' >/dev/null; then
  printf '{"error":"reply exists but is not published","raw":%s}\n' \
    "$(printf '%s' "$verified_review" | jq -c .)" >&2
  exit 1
fi

printf '%s\n' "$url"
