#!/usr/bin/env bash
# unresolvedPrComments.sh — Fetch review data for babysit-pr.
#
# Returns one JSON document with:
#   - threads / activeThreads / uncertainThreads — review threads with
#     sentinel-recency state (active / uncertain / addressed).
#   - reviewBodyComments — raw bodies of every review from known automated
#     reviewers (CodeRabbit, Mendral, etc.), each with a stable fingerprint.
#     The agent reads bodies directly; we no longer pre-parse findings.
#   - issueComments — every top-level PR conversation comment, tagged with
#     isBabysitSentinel and isKnownBot flags.
#   - activeIssueComments — non-sentinel, non-bot issue comments whose
#     per-comment fingerprint is NOT already listed in any prior babysit-pr
#     summary. These are the human Conversation-tab comments needing a reply.
#   - priorBabysitSentinels — issue comments whose body contains the
#     babysit-pr sentinel prefix. Used for review-body + issue-comment dedupe.
#   - truncated — array naming any GraphQL connection that hit GitHub's
#     100-item cap (reviewThreads, thread-comments, reviews, issueComments).
#     Agent must surface this in the final summary.
#
# Usage: bash unresolvedPrComments.sh [pr-number]
# Compatible with macOS bash 3.2. Requires: gh, jq (>= 1.5),
# and one of shasum / sha256sum for fingerprinting.

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
# shellcheck source=_sentinel.sh
source "${SCRIPT_DIR}/_sentinel.sh"

exec 3>&1

output_error() {
  printf '%s' "$1" | jq -Rsc '{ error: . }' >&3
  exit 1
}

if command -v shasum >/dev/null 2>&1; then
  SHA256_CMD="shasum -a 256"
elif command -v sha256sum >/dev/null 2>&1; then
  SHA256_CMD="sha256sum"
else
  SHA256_CMD=""
fi

validate_prerequisites() {
  if ! command -v jq >/dev/null 2>&1; then
    printf '{"error":"jq not found. Install from https://stedolan.github.io/jq"}\n' >&3
    exit 1
  fi
  if ! command -v gh >/dev/null 2>&1; then
    output_error "gh CLI not found. Install from https://cli.github.com"
  fi
  if [ -z "$SHA256_CMD" ]; then
    output_error "Neither shasum nor sha256sum found on PATH."
  fi
  if ! gh api user --jq '.login' >/dev/null 2>&1; then
    output_error "Not authenticated with GitHub. Run: gh auth login"
  fi
}

get_pr_number() {
  local arg="${1:-}"
  if [ -n "$arg" ]; then
    if ! printf '%s' "$arg" | grep -qE '^[0-9]+$'; then
      output_error "Invalid PR number: ${arg}"
    fi
    printf '%s' "$arg"
    return
  fi

  local pr_json
  if ! pr_json="$(gh pr view --json number 2>/dev/null)"; then
    output_error "No PR found for current branch. Provide PR number as argument."
  fi

  local pr_num
  pr_num="$(printf '%s' "$pr_json" | jq -r '.number // empty')"
  if [ -z "$pr_num" ]; then
    output_error "No PR found for current branch. Provide PR number as argument."
  fi
  printf '%s' "$pr_num"
}

get_repo_info() {
  local repo_json
  if ! repo_json="$(gh repo view --json owner,name 2>/dev/null)"; then
    output_error "Could not determine repository. Are you in a git repo with a GitHub remote?"
  fi

  REPO_OWNER="$(printf '%s' "$repo_json" | jq -r '.owner.login // empty')"
  REPO_NAME="$(printf '%s' "$repo_json" | jq -r '.name // empty')"

  if [ -z "$REPO_OWNER" ] || [ -z "$REPO_NAME" ]; then
    output_error "Failed to parse repository info from gh CLI output."
  fi
}

# Each connection caps at GitHub's 100-item maximum. hasNextPage is checked
# after the fetch and surfaced via the top-level `truncated` array — real
# cursor pagination is a follow-up if the warning ever fires in practice.
GRAPHQL_QUERY='
query($owner: String!, $repo: String!, $pr: Int!) {
  repository(owner: $owner, name: $repo) {
    pullRequest(number: $pr) {
      title
      url
      reviewThreads(first: 100) {
        pageInfo { hasNextPage }
        nodes {
          id
          isResolved
          comments(first: 100) {
            pageInfo { hasNextPage }
            nodes {
              id
              databaseId
              body
              path
              line
              originalLine
              createdAt
              author {
                login
                __typename
              }
            }
          }
        }
      }
      reviews(first: 100) {
        pageInfo { hasNextPage }
        nodes {
          body
          author { login __typename }
          createdAt
        }
      }
      comments(first: 100) {
        pageInfo { hasNextPage }
        nodes {
          id
          databaseId
          body
          createdAt
          url
          author { login __typename }
        }
      }
    }
  }
}'

execute_graphql_query() {
  local owner="$1" repo="$2" pr_number="$3"
  local result
  if ! result="$(gh api graphql \
    -f "query=${GRAPHQL_QUERY}" \
    -f "owner=${owner}" \
    -f "repo=${repo}" \
    -F "pr=${pr_number}" 2>&1)"; then
    output_error "GraphQL query failed: ${result}"
  fi
  printf '%s' "$result"
}

is_code_scanning_alert_fixed() {
  local owner="$1" repo="$2" alert_number="$3"
  local result
  if ! result="$(gh api "repos/${owner}/${repo}/code-scanning/alerts/${alert_number}" 2>/dev/null)"; then
    return 1
  fi

  local state
  state="$(printf '%s' "$result" | jq -r '.most_recent_instance.state // empty')"
  [ "$state" = "fixed" ]
}

# Normalize a body for stable hashing: collapse all runs of whitespace
# (including newlines) to a single space, then trim. Trivial whitespace
# reshuffles by a bot do not churn the fingerprint.
normalize_body() {
  printf '%s' "$1" | tr -s '[:space:]' ' ' | sed -E 's/^ //; s/ $//'
}

# Echo first 16 hex chars of sha256(normalize(body)).
fingerprint_body() {
  local normalized
  normalized="$(normalize_body "$1")"
  printf '%s' "$normalized" | $SHA256_CMD | cut -c1-16
}

# Take a JSON array of {body, ...extra} and emit the same array with a
# `fingerprint` field added to each entry. Three jq spawns total regardless
# of N: one to stream bodies as base64, one to assemble the fingerprint
# array, one to zip them back onto the originals.
add_fingerprints() {
  local input_json="$1"
  local count
  count="$(printf '%s' "$input_json" | jq 'length')"
  if [ "$count" = "0" ]; then
    printf '[]'
    return
  fi

  local fps=()
  local line
  while IFS= read -r line; do
    [ -z "$line" ] && continue
    local body
    body="$(printf '%s' "$line" | base64 -d)"
    fps+=("$(fingerprint_body "$body")")
  done < <(printf '%s' "$input_json" | jq -r '.[] | .body // "" | @base64')

  local fps_json
  fps_json="$(printf '%s\n' "${fps[@]}" | jq -Rs 'split("\n") | map(select(. != ""))')"
  printf '%s' "$input_json" | jq --argjson fps "$fps_json" '
    [., $fps] | transpose | map(.[0] + { fingerprint: (.[1] // "") })
  '
}

main() {
  validate_prerequisites

  local pr_number
  pr_number="$(get_pr_number "${1:-}")"

  get_repo_info
  local owner="$REPO_OWNER"
  local repo="$REPO_NAME"

  local response
  response="$(execute_graphql_query "$owner" "$repo" "$pr_number")"

  if [ "$(printf '%s' "$response" | jq -r '.data.repository // empty')" = "" ]; then
    output_error "Repository ${owner}/${repo} not found or not accessible."
  fi
  if [ "$(printf '%s' "$response" | jq -r '.data.repository.pullRequest // empty')" = "" ]; then
    output_error "PR #${pr_number} not found or not accessible."
  fi

  local title url
  title="$(printf '%s' "$response" | jq -r '.data.repository.pullRequest.title')"
  url="$(printf '%s' "$response" | jq -r '.data.repository.pullRequest.url')"

  # Bot detection combines TWO signals (union, not intersection):
  #   1. GraphQL `author.__typename == "Bot"` — catches every bot GitHub marks
  #      as such. Primary signal.
  #   2. Login allowlist BOTS_JSON (sourced from _sentinel.sh) — catches
  #      GitHub Apps/Actions that post via a User-type service account.

  # Per-thread emitted fields:
  #   - threadId, replyToCommentDatabaseId, comments[], isResolved, file, line
  #   - lastBabysitSentinelAt:     max createdAt of OUR sentinel replies
  #   - lastHumanCommentAt:        max createdAt of non-sentinel, non-bot comments
  #   - lastBotCommentAt:          max createdAt of non-sentinel bot comments
  #   - postSentinelBotComments:   ARRAY of every bot comment after the sentinel
  #   - postSentinelHumanComments: ARRAY of every human comment after the sentinel
  #   - activityState: "active" / "uncertain" / "addressed"
  local threads_json
  threads_json="$(printf '%s' "$response" | jq --arg sentinel_prefix "$SENTINEL_PREFIX" --argjson bots "$BOTS_JSON" '
    def is_bot: ((.author.__typename // "") == "Bot") or ((.author.login // "") | IN($bots[]));
    def is_sentinel: ((.body // "") | contains($sentinel_prefix));
    [
      .data.repository.pullRequest.reviewThreads.nodes[]
      | select(.isResolved == false)
      | . as $t
      | ($t.comments.nodes) as $comments
      | {
          threadId: $t.id,
          isResolved: $t.isResolved,
          replyToCommentDatabaseId: ($comments[0].databaseId // null),
          file: ($comments[0].path // null),
          line: ($comments[0].line // $comments[0].originalLine // null),
          commentsTruncated: ($t.comments.pageInfo.hasNextPage // false),
          comments: [
            $comments[] | {
              id,
              databaseId,
              author: (.author.login // "deleted-user"),
              authorType: (.author.__typename // null),
              body,
              createdAt,
              file: .path,
              line: (.line // .originalLine),
              isBabysitSentinel: is_sentinel,
              isKnownBot: is_bot
            }
          ],
          lastBabysitSentinelAt: (
            [$comments[] | select(is_sentinel) | .createdAt] | sort | last
          ),
          lastHumanCommentAt: (
            [$comments[] | select(is_sentinel | not) | select(is_bot | not) | .createdAt]
            | sort | last
          ),
          lastBotCommentAt: (
            [$comments[] | select(is_sentinel | not) | select(is_bot) | .createdAt]
            | sort | last
          )
        }
      | . as $thread
      | .postSentinelBotComments = (
          if $thread.lastBabysitSentinelAt == null then []
          else [
            $comments[]
            | select(is_bot)
            | select(is_sentinel | not)
            | select(.createdAt > $thread.lastBabysitSentinelAt)
            | {
                id,
                createdAt,
                author: (.author.login // "deleted-user"),
                authorType: (.author.__typename // null),
                body
              }
          ]
          end
        )
      | .postSentinelHumanComments = (
          if $thread.lastBabysitSentinelAt == null then []
          else [
            $comments[]
            | select(is_bot | not)
            | select(is_sentinel | not)
            | select(.createdAt > $thread.lastBabysitSentinelAt)
            | {
                id,
                createdAt,
                author: (.author.login // "deleted-user"),
                body
              }
          ]
          end
        )
      | .activityState = (
          if .lastBabysitSentinelAt == null then
            "active"
          elif (.postSentinelHumanComments | length) > 0 then
            "active"
          elif (.postSentinelBotComments | length) > 0 then
            "uncertain"
          else
            "addressed"
          end
        )
    ]
  ')"

  # Flattened unresolved_comments — retained for backward compat.
  local all_unresolved
  all_unresolved="$(printf '%s' "$threads_json" | jq '[
    .[]
    | select(.activityState != "addressed")
    | .comments[]
    | select(.isBabysitSentinel | not)
    | {
        author,
        body,
        createdAt,
        file,
        line
      }
  ]')"

  # Filter out fixed code-scanning alerts from github-advanced-security.
  local security_alerts
  security_alerts="$(printf '%s' "$all_unresolved" | jq -r '
    .[]
    | select(.author == "github-advanced-security" or .author == "github-advanced-security[bot]")
    | try (.body | capture("/code-scanning/(?<n>[0-9]+)") | .n)
  ' | sort -u)"

  local fixed_alerts="" alert_number
  for alert_number in $security_alerts; do
    if is_code_scanning_alert_fixed "$owner" "$repo" "$alert_number"; then
      fixed_alerts="${fixed_alerts} ${alert_number}"
    fi
  done

  local unresolved_comments
  if [ -z "$fixed_alerts" ]; then
    unresolved_comments="$all_unresolved"
  else
    unresolved_comments="$(printf '%s' "$all_unresolved" | jq --arg fixed "$fixed_alerts" '
      ($fixed | split(" ") | map(select(length > 0))) as $fixedSet
      | map(
          . as $c
          | if ($c.author == "github-advanced-security" or $c.author == "github-advanced-security[bot]") then
              (((try ($c.body | capture("/code-scanning/(?<n>[0-9]+)") | .n)) // null)) as $n
              | if ($n != null and ($n | IN($fixedSet[]))) then empty else $c end
            else $c end
        )
    ')"
  fi

  # Raw review-body comments from known bots. The agent reads each body itself
  # and extracts findings; no pre-parsing.
  local raw_review_body_comments
  raw_review_body_comments="$(printf '%s' "$response" | jq --argjson bots "$BOTS_JSON" '
    def is_bot_author: ((.author.__typename // "") == "Bot") or ((.author.login // "") | IN($bots[]));
    [
      .data.repository.pullRequest.reviews.nodes[]
      | select((.body // "") != "")
      | select(is_bot_author)
      | {
          author: (.author.login // "deleted-user"),
          authorType: (.author.__typename // null),
          createdAt: .createdAt,
          body: .body
        }
    ]
  ')"
  local review_body_comments
  review_body_comments="$(add_fingerprints "$raw_review_body_comments")"

  # All issue comments (top-level Conversation-tab comments).
  local raw_issue_comments
  raw_issue_comments="$(printf '%s' "$response" | jq --arg sentinel_prefix "$SENTINEL_PREFIX" --argjson bots "$BOTS_JSON" '
    def is_sentinel_body: ((.body // "") | contains($sentinel_prefix));
    def is_bot_author: ((.author.__typename // "") == "Bot") or ((.author.login // "") | IN($bots[]));
    [
      .data.repository.pullRequest.comments.nodes[]
      | {
          id,
          databaseId,
          author: (.author.login // "deleted-user"),
          authorType: (.author.__typename // null),
          body,
          createdAt,
          url,
          isBabysitSentinel: is_sentinel_body,
          isKnownBot: is_bot_author
        }
    ]
  ')"
  local issue_comments
  issue_comments="$(add_fingerprints "$raw_issue_comments")"

  # priorBabysitSentinels: issue comments containing the sentinel prefix.
  local prior_sentinels
  prior_sentinels="$(printf '%s' "$issue_comments" | jq '[.[] | select(.isBabysitSentinel)]')"

  # Concatenate prior sentinel bodies into one blob — used as a haystack for
  # fingerprint dedupe (both review-body and issue-comment fingerprints land
  # in the fenced block at the end of a babysit-pr summary).
  local prior_sentinel_blob
  prior_sentinel_blob="$(printf '%s' "$prior_sentinels" | jq -r '[.[].body] | join("\n")')"

  # activeIssueComments: non-sentinel, non-bot comments whose fingerprint is
  # NOT already listed in any prior babysit-pr summary.
  local active_issue_comments
  active_issue_comments="$(printf '%s' "$issue_comments" | jq --arg blob "$prior_sentinel_blob" '
    [.[]
      | select(.isBabysitSentinel | not)
      | select(.isKnownBot | not)
      | select($blob | contains(.fingerprint) | not)
    ]
  ')"

  # Active threads: anything NOT yet addressed.
  local active_threads total_active_threads uncertain_threads total_uncertain_threads
  active_threads="$(printf '%s' "$threads_json" | jq '[.[] | select(.activityState != "addressed")]')"
  total_active_threads="$(printf '%s' "$active_threads" | jq 'length')"
  uncertain_threads="$(printf '%s' "$threads_json" | jq '[.[] | select(.activityState == "uncertain")]')"
  total_uncertain_threads="$(printf '%s' "$uncertain_threads" | jq 'length')"

  local total_unresolved total_review_body_comments total_active_issue_comments
  total_unresolved="$(printf '%s' "$unresolved_comments" | jq 'length')"
  total_review_body_comments="$(printf '%s' "$review_body_comments" | jq 'length')"
  total_active_issue_comments="$(printf '%s' "$active_issue_comments" | jq 'length')"

  # Truncation: which connections hit GitHub's 100-item GraphQL cap?
  local truncated
  truncated="$(jq -n \
    --argjson response "$response" \
    --argjson threads "$threads_json" \
    '
    [
      (if $response.data.repository.pullRequest.reviewThreads.pageInfo.hasNextPage then "reviewThreads" else empty end),
      (if [$threads[] | select(.commentsTruncated)] | length > 0 then "thread-comments" else empty end),
      (if $response.data.repository.pullRequest.reviews.pageInfo.hasNextPage then "reviews" else empty end),
      (if $response.data.repository.pullRequest.comments.pageInfo.hasNextPage then "issueComments" else empty end)
    ]
  ')"

  jq -n \
    --argjson activeIssueComments "$active_issue_comments" \
    --argjson activeThreads "$active_threads" \
    --argjson issueComments "$issue_comments" \
    --arg owner "$owner" \
    --argjson prNumber "$pr_number" \
    --argjson priorBabysitSentinels "$prior_sentinels" \
    --arg repo "$repo" \
    --argjson reviewBodyComments "$review_body_comments" \
    --arg sentinel "$SENTINEL" \
    --arg title "$title" \
    --argjson threads "$threads_json" \
    --argjson totalActiveIssueComments "$total_active_issue_comments" \
    --argjson totalActiveThreads "$total_active_threads" \
    --argjson totalReviewBodyComments "$total_review_body_comments" \
    --argjson totalUncertainThreads "$total_uncertain_threads" \
    --argjson totalUnresolvedComments "$total_unresolved" \
    --argjson truncated "$truncated" \
    --argjson uncertainThreads "$uncertain_threads" \
    --argjson unresolvedComments "$unresolved_comments" \
    --arg url "$url" \
    '{
      activeIssueComments: $activeIssueComments,
      activeThreads: $activeThreads,
      issueComments: $issueComments,
      owner: $owner,
      prNumber: $prNumber,
      priorBabysitSentinels: $priorBabysitSentinels,
      repo: $repo,
      reviewBodyComments: $reviewBodyComments,
      sentinel: $sentinel,
      threads: $threads,
      title: $title,
      totalActiveIssueComments: $totalActiveIssueComments,
      totalActiveThreads: $totalActiveThreads,
      totalReviewBodyComments: $totalReviewBodyComments,
      totalUncertainThreads: $totalUncertainThreads,
      totalUnresolvedComments: $totalUnresolvedComments,
      truncated: $truncated,
      uncertainThreads: $uncertainThreads,
      unresolvedComments: $unresolvedComments,
      url: $url
    }'
}

main "$@"
