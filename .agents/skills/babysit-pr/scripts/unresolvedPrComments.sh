#!/usr/bin/env bash
# unresolvedPrComments.sh — Fetch review threads + nitpicks for babysit-pr.
# Extended from plugins/core/skills/unresolved-pr-comments/scripts/unresolvedPrComments.sh.
# Adds: thread IDs, per-thread sentinel recency state, stable nitpick fingerprints.
#
# Usage: bash unresolvedPrComments.sh [pr-number]
# Compatible with macOS bash 3.2. Requires: gh, jq (>= 1.5), perl with Digest::SHA.

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
# shellcheck source=parseNitpicks.sh
source "${SCRIPT_DIR}/parseNitpicks.sh"

SENTINEL='<!-- babysit-pr:addressed v1 -->'

exec 3>&1

output_error() {
  printf '%s' "$1" | jq -Rsc '{ error: . }' >&3
  exit 1
}

validate_prerequisites() {
  if ! command -v jq >/dev/null 2>&1; then
    printf '{"error":"jq not found. Install from https://stedolan.github.io/jq"}\n' >&3
    exit 1
  fi
  if ! command -v gh >/dev/null 2>&1; then
    output_error "gh CLI not found. Install from https://cli.github.com"
  fi
  if ! command -v perl >/dev/null 2>&1; then
    output_error "perl not found."
  fi
  if ! perl -MDigest::SHA -e1 >/dev/null 2>&1; then
    output_error "Perl Digest::SHA module not found (should be in core Perl since 5.9.3)."
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

# Pagination limits: 100 review threads, 20 comments per thread, 100 reviews.
GRAPHQL_QUERY='
query($owner: String!, $repo: String!, $pr: Int!) {
  repository(owner: $owner, name: $repo) {
    pullRequest(number: $pr) {
      title
      url
      reviewThreads(first: 100) {
        nodes {
          id
          isResolved
          comments(first: 20) {
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
        nodes {
          body
          author { login }
          createdAt
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

  # Build threads with sentinel recency state.
  #
  # Bot detection combines TWO signals (union, not intersection):
  #   1. GraphQL `author.__typename == "Bot"` — catches every bot GitHub marks as such,
  #      including bots not on our allowlist. This is the primary signal.
  #   2. Login allowlist — catches GitHub Apps/Actions that post via a User-type service
  #      account rather than a Bot account.
  # An unknown bot whose login we don't recognize but which is type=Bot still gets
  # classified correctly; we never fall back to treating it as a human.
  #
  # Per-thread emitted fields:
  #   - threadId, replyToCommentDatabaseId, comments[], isResolved, file, line
  #   - lastBabysitSentinelAt:     max createdAt of OUR sentinel replies (null if none)
  #   - lastHumanCommentAt:        max createdAt of non-sentinel, non-bot comments
  #   - lastBotCommentAt:          max createdAt of non-sentinel bot comments
  #   - postSentinelBotComments:   ARRAY of every bot comment after lastBabysitSentinelAt
  #                                (the agent inspects ALL of them; a later ack must not hide
  #                                an earlier actionable bot comment)
  #   - postSentinelHumanComments: ARRAY of every human comment after lastBabysitSentinelAt
  #   - activityState: tri-state, one of:
  #       "active"     — needs a reply (no sentinel yet, OR a human commented after our sentinel)
  #       "uncertain"  — sentinel exists, but a bot posted after it; agent MUST inspect every
  #                      entry in postSentinelBotComments and treat as active unless EVERY one
  #                      is confidently a non-actionable acknowledgement
  #       "addressed"  — our sentinel is the newest relevant activity on this thread
  local bots_json='["coderabbitai","coderabbitai[bot]","dependabot","dependabot[bot]","github-actions","github-actions[bot]","github-advanced-security","github-advanced-security[bot]","renovate","renovate[bot]","renovate-bot","pre-commit-ci","pre-commit-ci[bot]","codecov","codecov[bot]","sonarcloud","sonarcloud[bot]"]'
  local threads_json
  threads_json="$(printf '%s' "$response" | jq --arg sentinel "$SENTINEL" --argjson bots "$bots_json" '
    # Exact login equality via IN($bots[]) — do NOT use `inside($bots)`, which
    # does substring matching for strings and would classify login "code" as a
    # bot because it appears inside "codecov".
    def is_bot: ((.author.__typename // "") == "Bot") or ((.author.login // "") | IN($bots[]));
    def is_sentinel: ((.body // "") | contains($sentinel));
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

  # Flattened unresolved_comments (retained for backward compat with the prose summary).
  # Includes comments from "active" AND "uncertain" threads so the agent never misses new feedback.
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

  # Filter out fixed code-scanning alerts from github-advanced-security
  local unresolved_comments="[]"
  local count
  count="$(printf '%s' "$all_unresolved" | jq 'length')"

  local i=0
  while [ "$i" -lt "$count" ]; do
    local comment
    comment="$(printf '%s' "$all_unresolved" | jq ".[$i]")"
    local comment_author
    comment_author="$(printf '%s' "$comment" | jq -r '.author')"

    local keep=true
    # GitHub Advanced Security's bot posts under either login depending on account
    # type (app installation vs. direct). Match both forms.
    case "$comment_author" in
      "github-advanced-security"|"github-advanced-security[bot]")
        local comment_body alert_number
        comment_body="$(printf '%s' "$comment" | jq -r '.body')"
        alert_number="$(extract_code_scanning_alert_number "$comment_body")"
        if [ -n "$alert_number" ]; then
          if is_code_scanning_alert_fixed "$owner" "$repo" "$alert_number"; then
            keep=false
          fi
        fi
        ;;
    esac

    if [ "$keep" = true ]; then
      unresolved_comments="$(printf '%s' "$unresolved_comments" | jq --argjson c "$comment" '. + [$c]')"
    fi

    i=$((i + 1))
  done

  # Nitpicks from coderabbit review bodies
  local reviews_json
  reviews_json="$(printf '%s' "$response" | jq '[.data.repository.pullRequest.reviews.nodes[]]')"
  local nitpick_comments
  nitpick_comments="$(extract_nitpick_comments "$reviews_json")"

  # Active threads: anything NOT yet addressed. Includes "uncertain" — agent must inspect.
  local active_threads total_active_threads uncertain_threads total_uncertain_threads
  active_threads="$(printf '%s' "$threads_json" | jq '[.[] | select(.activityState != "addressed")]')"
  total_active_threads="$(printf '%s' "$active_threads" | jq 'length')"
  uncertain_threads="$(printf '%s' "$threads_json" | jq '[.[] | select(.activityState == "uncertain")]')"
  total_uncertain_threads="$(printf '%s' "$uncertain_threads" | jq 'length')"

  local total_unresolved total_nitpicks
  total_unresolved="$(printf '%s' "$unresolved_comments" | jq 'length')"
  total_nitpicks="$(printf '%s' "$nitpick_comments" | jq 'length')"

  jq -n \
    --argjson activeThreads "$active_threads" \
    --argjson nitpickComments "$nitpick_comments" \
    --arg owner "$owner" \
    --argjson prNumber "$pr_number" \
    --arg repo "$repo" \
    --arg sentinel "$SENTINEL" \
    --arg title "$title" \
    --argjson threads "$threads_json" \
    --argjson totalActiveThreads "$total_active_threads" \
    --argjson totalNitpicks "$total_nitpicks" \
    --argjson totalUncertainThreads "$total_uncertain_threads" \
    --argjson totalUnresolvedComments "$total_unresolved" \
    --argjson uncertainThreads "$uncertain_threads" \
    --argjson unresolvedComments "$unresolved_comments" \
    --arg url "$url" \
    '{
      activeThreads: $activeThreads,
      nitpickComments: $nitpickComments,
      owner: $owner,
      prNumber: $prNumber,
      repo: $repo,
      sentinel: $sentinel,
      threads: $threads,
      title: $title,
      totalActiveThreads: $totalActiveThreads,
      totalNitpicks: $totalNitpicks,
      totalUncertainThreads: $totalUncertainThreads,
      totalUnresolvedComments: $totalUnresolvedComments,
      uncertainThreads: $uncertainThreads,
      unresolvedComments: $unresolvedComments,
      url: $url
    }'
}

main "$@"
