#!/usr/bin/env bash
# cspell:ignore mendral tostring
# collect-ai-review-feedback.sh — Fetch pending AI review feedback for a GitHub PR.
# Usage: bash collect-ai-review-feedback.sh [pr-number]
# Outputs JSON with unresolved AI review threads and CodeRabbit nitpicks that
# have not yet received an ai-review-responder reply marker.

set -euo pipefail

AI_REVIEW_MARKER="<!-- ai-review-responder -->"
THREAD_MARKER_PREFIX="<!-- ai-review-responder:thread:"
NITPICK_MARKER_PREFIX="<!-- ai-review-responder:nitpick:"
AI_BOTS_JSON='["coderabbitai","devin-ai-integration","mendral-app"]'

# Save original stdout so output_error works inside $() command substitutions.
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
              body
              path
              line
              originalLine
              author { login }
              createdAt
              url
            }
          }
        }
      }
      reviews(first: 100) {
        nodes {
          id
          body
          state
          createdAt
          url
          author { login }
        }
      }
      comments(first: 100) {
        nodes {
          body
          createdAt
          url
          author { login }
        }
      }
    }
  }
}'

execute_graphql_query() {
  local owner="$1"
  local repo="$2"
  local pr_number="$3"
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

extract_all_nitpick_comments() {
  local reviews_json="$1"

  printf '%s' "$reviews_json" | perl -e '
use strict;
use warnings;
use JSON::PP;

local $/;
my $reviews_json = <STDIN>;
my $reviews = decode_json($reviews_json);
my @comments;

for my $review (@$reviews) {
  my $author = $review->{author}{login} // "";
  my $body = $review->{body} // "";
  next unless $author eq "coderabbitai" && $body =~ /Nitpick comments/;

  my $nitpick_content = extract_nitpick_section($body);
  next unless defined $nitpick_content;

  my $review_id = $review->{id} // "";
  my $review_url = $review->{url} // "";
  my $created_at = $review->{createdAt} // "";
  my $nitpick_index = 0;

  while ($nitpick_content =~ /<details>\s*<summary>([^<]+?)\s+\(\d+\)<\/summary>\s*<blockquote>([\s\S]*?)<\/blockquote>\s*<\/details>/g) {
    my $file_name = trim($1);
    my $file_content = $2;

    while ($file_content =~ /`(\d+(?:-\d+)?)`:\s*\*\*([^*]+)\*\*\s*([\s\S]*?)(?=---|\n`\d|<\/blockquote>|$)/g) {
      $nitpick_index += 1;
      my $line_range = $1;
      my $title = trim($2);
      my $clean_body = clean_comment_body(trim($3));

      push @comments, {
        author       => $author,
        body         => "$title\n\n$clean_body",
        createdAt    => $created_at,
        file         => $file_name,
        line         => $line_range,
        nitpickIndex => $nitpick_index,
        reviewId     => $review_id,
        reviewUrl    => $review_url,
      };
    }
  }
}

print encode_json(\@comments);

sub extract_nitpick_section {
  my ($text) = @_;
  if ($text =~ /<summary>\x{1f9f9} Nitpick comments \(\d+\)<\/summary>\s*<blockquote>/i) {
    my $content_start = $+[0];
    my $after = substr($text, $content_start);

    my $depth = 1;
    my @tags;
    while ($after =~ /(<blockquote>|<\/blockquote>)/gi) {
      my $tag = $1;
      my $pos = $-[0];
      my $is_open = ($tag =~ /^<blockquote>/i) ? 1 : 0;
      push @tags, [$pos, $is_open];
    }

    for my $tag (@tags) {
      $depth += $tag->[1] ? 1 : -1;
      if ($depth == 0) {
        return substr($after, 0, $tag->[0]);
      }
    }
  }
  return undef;
}

sub clean_comment_body {
  my ($text) = @_;
  my $prev = "";
  while ($text ne $prev) {
    $prev = $text;
    $text =~ s/<details>(?:(?!<details>)[\s\S])*?<\/details>//g;
  }
  $text =~ s/</&lt;/g;
  $text =~ s/>/&gt;/g;
  return trim($text);
}

sub trim {
  my ($s) = @_;
  $s =~ s/^\s+//;
  $s =~ s/\s+$//;
  return $s;
}
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

  local title
  local url
  title="$(printf '%s' "$response" | jq -r '.data.repository.pullRequest.title')"
  url="$(printf '%s' "$response" | jq -r '.data.repository.pullRequest.url')"

  local pending_thread_comments
  pending_thread_comments="$(printf '%s' "$response" | jq \
    --arg marker "$AI_REVIEW_MARKER" \
    --arg prefix "$THREAD_MARKER_PREFIX" \
    --argjson aiBots "$AI_BOTS_JSON" '
      [
        .data.repository.pullRequest.reviewThreads.nodes[]
        | select(.isResolved == false)
        | . as $thread
        | ($thread.comments.nodes[0].author.login // "") as $reviewer
        | select(any($aiBots[]; . == $reviewer))
        | ($prefix + $thread.id + " -->") as $threadMarker
        | select(
            any(
              $thread.comments.nodes[]?;
              (((.body // "") | contains($marker)) or ((.body // "") | contains($threadMarker)))
            ) | not
          )
        | {
            author: $reviewer,
            conversation: [
              $thread.comments.nodes[]
              | {
                  author: (.author.login // "deleted-user"),
                  body: .body,
                  createdAt: .createdAt,
                  id: .id,
                  line: (.line // .originalLine),
                  path: .path,
                  url: .url
                }
            ],
            createdAt: ($thread.comments.nodes[0].createdAt // ""),
            file: ($thread.comments.nodes[0].path // ""),
            line: ($thread.comments.nodes[0].line // $thread.comments.nodes[0].originalLine),
            marker: $threadMarker,
            threadId: $thread.id,
            url: ($thread.comments.nodes[0].url // "")
          }
      ]')"

  local reviews_json
  reviews_json="$(printf '%s' "$response" | jq '[.data.repository.pullRequest.reviews.nodes[]]')"

  local nitpick_comments
  nitpick_comments="$(extract_all_nitpick_comments "$reviews_json")"

  local pr_comments_json
  pr_comments_json="$(printf '%s' "$response" | jq '[.data.repository.pullRequest.comments.nodes[]]')"

  local pending_nitpick_comments
  pending_nitpick_comments="$(
    printf '%s' "$nitpick_comments" | jq \
      --arg prefix "$NITPICK_MARKER_PREFIX" \
      --argjson prComments "$pr_comments_json" '
        [
          .[]
          | . as $nitpick
          | ($prefix + $nitpick.reviewId + ":" + ($nitpick.nitpickIndex | tostring) + " -->") as $nitpickMarker
          | select(
              any(
                $prComments[]?;
                (.body // "") | contains($nitpickMarker)
              ) | not
            )
          | $nitpick + { marker: $nitpickMarker }
        ]'
  )"

  local total_pending_thread_comments
  local total_pending_nitpick_comments
  local total_pending_comments

  total_pending_thread_comments="$(printf '%s' "$pending_thread_comments" | jq 'length')"
  total_pending_nitpick_comments="$(printf '%s' "$pending_nitpick_comments" | jq 'length')"
  total_pending_comments="$((total_pending_thread_comments + total_pending_nitpick_comments))"

  jq -n \
    --arg genericMarker "$AI_REVIEW_MARKER" \
    --argjson aiBots "$AI_BOTS_JSON" \
    --arg owner "$owner" \
    --argjson pendingNitpickComments "$pending_nitpick_comments" \
    --argjson pendingThreadComments "$pending_thread_comments" \
    --argjson prNumber "$pr_number" \
    --arg repo "$repo" \
    --arg title "$title" \
    --argjson totalPendingComments "$total_pending_comments" \
    --argjson totalPendingNitpickComments "$total_pending_nitpick_comments" \
    --argjson totalPendingThreadComments "$total_pending_thread_comments" \
    --arg url "$url" \
    '{
      aiBots: $aiBots,
      genericMarker: $genericMarker,
      owner: $owner,
      pendingNitpickComments: $pendingNitpickComments,
      pendingThreadComments: $pendingThreadComments,
      prNumber: $prNumber,
      repo: $repo,
      title: $title,
      totalPendingComments: $totalPendingComments,
      totalPendingNitpickComments: $totalPendingNitpickComments,
      totalPendingThreadComments: $totalPendingThreadComments,
      url: $url
    }'
}

main "$@"
