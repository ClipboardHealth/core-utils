#!/usr/bin/env bash
# Fetch unresolved review comments from a GitHub pull request
set -euo pipefail

PR_NUMBER="${1:-}"

# Check for gh CLI
if ! command -v gh >/dev/null 2>&1; then
  echo '{"error": "gh CLI not found. Install from https://cli.github.com"}' >&2
  exit 1
fi

# Check gh auth status
if ! gh auth status >/dev/null 2>&1; then
  echo '{"error": "Not authenticated with GitHub. Run: gh auth login"}' >&2
  exit 1
fi

# Get PR number if not provided
if [[ -z "$PR_NUMBER" ]]; then
  PR_NUMBER=$(gh pr view --json number --jq '.number' 2>/dev/null) || {
    echo '{"error": "No PR found for current branch. Provide PR number as argument."}' >&2
    exit 1
  }
fi

# Validate PR number is numeric
if ! [[ "$PR_NUMBER" =~ ^[0-9]+$ ]]; then
  echo '{"error": "Invalid PR number: '"$PR_NUMBER"'"}' >&2
  exit 1
fi

# Get repo owner and name
REPO_INFO=$(gh repo view --json owner,name --jq '"\(.owner.login) \(.name)"' 2>/dev/null) || {
  echo '{"error": "Could not determine repository. Are you in a git repo with a GitHub remote?"}' >&2
  exit 1
}
read -r OWNER REPO <<< "$REPO_INFO"

# Fetch unresolved review threads
# shellcheck disable=SC2016 # GraphQL variables, not shell variables
RESULT=$(gh api graphql -f query='
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
              author { login }
              createdAt
            }
          }
        }
      }
    }
  }
}' -f owner="$OWNER" -f repo="$REPO" -F pr="$PR_NUMBER" 2>&1) || {
  jq -n --arg msg "GraphQL query failed: $RESULT" '{"error": $msg}' >&2
  exit 1
}

# Filter to unresolved threads and format output
echo "$RESULT" | jq --argjson pr_number "$PR_NUMBER" \
                    --arg owner "$OWNER" \
                    --arg repo "$REPO" \
'{
  pr_number: $pr_number,
  owner: $owner,
  repo: $repo,
  title: .data.repository.pullRequest.title,
  url: .data.repository.pullRequest.url,
  unresolved_threads: [
    .data.repository.pullRequest.reviewThreads.nodes[]
    | select(.isResolved == false)
    | .comments.nodes[0]
    | {
        file: .path,
        line: .line,
        author: (.author.login // "deleted-user"),
        created_at: .createdAt,
        body: .body
      }
  ],
  total_unresolved: (
    [.data.repository.pullRequest.reviewThreads.nodes[] | select(.isResolved == false)] | length
  )
}'
