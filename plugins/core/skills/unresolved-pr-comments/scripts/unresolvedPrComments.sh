#!/usr/bin/env bash
# unresolvedPrComments.sh — Fetch unresolved review comments from a GitHub PR.
# Usage: bash unresolvedPrComments.sh [pr-number]
# Outputs JSON with unresolved comments and CodeRabbit nitpicks.
# Compatible with macOS bash 3.2. Requires: gh, jq, perl.

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
# shellcheck source=parseNitpicks.sh
source "${SCRIPT_DIR}/parseNitpicks.sh"

# Save original stdout so output_error works inside $() command substitutions
exec 3>&1

# --- Helpers (inlined from ghClient.ts / prClient.ts) ---

output_error() {
  printf '%s' "$1" | jq -Rsc '{ error: . }' >&3
  exit 1
}

validate_prerequisites() {
  if ! command -v gh >/dev/null 2>&1; then
    output_error "gh CLI not found. Install from https://cli.github.com"
  fi
  if ! command -v jq >/dev/null 2>&1; then
    output_error "jq not found. Install from https://stedolan.github.io/jq"
  fi
  if ! command -v perl >/dev/null 2>&1; then
    output_error "perl not found."
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

# --- GraphQL ---

# Pagination limits: 100 review threads, 10 comments per thread, 100 reviews.
# Sufficient for typical PRs; data may be truncated on exceptionally active PRs.
GRAPHQL_QUERY='
query($owner: String!, $repo: String!, $pr: Int!) {
  repository(owner: $owner, name: $repo) {
    pullRequest(number: $pr) {
      title
      url
      reviewThreads(first: 100) {
        nodes {
          isResolved
          comments(first: 10) {
            nodes {
              body
              path
              line
              originalLine
              author { login }
              createdAt
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

# --- Code scanning filter ---

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

# --- Main ---

main() {
  validate_prerequisites

  local pr_number
  pr_number="$(get_pr_number "${1:-}")"

  get_repo_info
  local owner="$REPO_OWNER"
  local repo="$REPO_NAME"

  local response
  response="$(execute_graphql_query "$owner" "$repo" "$pr_number")"

  # Validate response
  if [ "$(printf '%s' "$response" | jq -r '.data.repository // empty')" = "" ]; then
    output_error "Repository ${owner}/${repo} not found or not accessible."
  fi
  if [ "$(printf '%s' "$response" | jq -r '.data.repository.pullRequest // empty')" = "" ]; then
    output_error "PR #${pr_number} not found or not accessible."
  fi

  local title url
  title="$(printf '%s' "$response" | jq -r '.data.repository.pullRequest.title')"
  url="$(printf '%s' "$response" | jq -r '.data.repository.pullRequest.url')"

  # Extract unresolved comments: filter unresolved threads, flatten comments
  local all_unresolved
  all_unresolved="$(printf '%s' "$response" | jq '[
    .data.repository.pullRequest.reviewThreads.nodes[]
    | select(.isResolved == false)
    | .comments.nodes[]
    | {
        author: (.author.login // "deleted-user"),
        body: .body,
        createdAt: .createdAt,
        file: .path,
        line: (.line // .originalLine)
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
    if [ "$comment_author" = "github-advanced-security" ]; then
      local comment_body alert_number
      comment_body="$(printf '%s' "$comment" | jq -r '.body')"
      alert_number="$(extract_code_scanning_alert_number "$comment_body")"
      if [ -n "$alert_number" ]; then
        if is_code_scanning_alert_fixed "$owner" "$repo" "$alert_number"; then
          keep=false
        fi
      fi
    fi

    if [ "$keep" = true ]; then
      unresolved_comments="$(printf '%s' "$unresolved_comments" | jq --argjson c "$comment" '. + [$c]')"
    fi

    i=$((i + 1))
  done

  # Extract nitpick comments from reviews
  local reviews_json
  reviews_json="$(printf '%s' "$response" | jq '[.data.repository.pullRequest.reviews.nodes[]]')"
  local nitpick_comments
  nitpick_comments="$(extract_nitpick_comments "$reviews_json")"

  # Build final output
  local total_unresolved total_nitpicks
  total_unresolved="$(printf '%s' "$unresolved_comments" | jq 'length')"
  total_nitpicks="$(printf '%s' "$nitpick_comments" | jq 'length')"

  jq -n \
    --argjson nitpickComments "$nitpick_comments" \
    --arg owner "$owner" \
    --argjson prNumber "$pr_number" \
    --arg repo "$repo" \
    --arg title "$title" \
    --argjson totalNitpicks "$total_nitpicks" \
    --argjson totalUnresolvedComments "$total_unresolved" \
    --argjson unresolvedComments "$unresolved_comments" \
    --arg url "$url" \
    '{
      nitpickComments: $nitpickComments,
      owner: $owner,
      prNumber: $prNumber,
      repo: $repo,
      title: $title,
      totalNitpicks: $totalNitpicks,
      totalUnresolvedComments: $totalUnresolvedComments,
      unresolvedComments: $unresolvedComments,
      url: $url
    }'
}

main "$@"
