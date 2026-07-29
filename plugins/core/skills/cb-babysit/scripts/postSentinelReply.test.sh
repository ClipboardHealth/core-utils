#!/usr/bin/env bash

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
# shellcheck source=_sentinel.sh
source "${SCRIPT_DIR}/_sentinel.sh"
SCRIPT="${SCRIPT_DIR}/postSentinelReply.sh"
TEST_TMP_DIR="$(mktemp -d)"
trap 'rm -rf "$TEST_TMP_DIR"' EXIT

fail() {
  printf 'FAIL: %s\n' "$1" >&2
  exit 1
}

assert_equals() {
  local expected="$1"
  local actual="$2"
  local message="$3"
  if [ "$actual" != "$expected" ]; then
    fail "${message}: expected '${expected}', got '${actual}'"
  fi
}

assert_file_contains() {
  local file="$1"
  local expected="$2"
  local message="$3"
  if ! grep -Fq "$expected" "$file"; then
    fail "${message}: '${expected}' not found in ${file}"
  fi
}

assert_file_excludes() {
  local file="$1"
  local unexpected="$2"
  local message="$3"
  if grep -Fq "$unexpected" "$file"; then
    fail "${message}: '${unexpected}' unexpectedly found in ${file}"
  fi
}

gh() {
  if [ "$1" != "api" ]; then
    printf 'Unexpected gh invocation: %s\n' "$*" >&2
    return 1
  fi

  if [ "$2" = "--method" ]; then
    local method="$3"
    local endpoint="$4"
    printf '%s %s\n' "$method" "$endpoint" >>"$MOCK_GH_LOG"

    if [ "$method" != "POST" ] ||
      [ "$endpoint" != "repos/ClipboardHealth/core-utils/pulls/42/comments/456/replies" ]; then
      printf 'Unexpected mutation: %s\n' "$*" >&2
      return 1
    fi

    printf '%s' "${6#body=}" >"$MOCK_REQUEST_BODY"
    if [ "$MOCK_SCENARIO" = "create-failure" ]; then
      printf 'creation failed\n' >&2
      return 1
    fi

    jq -n \
      --arg body "${6#body=}" \
      '{
        id: 123,
        html_url: "https://github.com/ClipboardHealth/core-utils/pull/42#discussion_r123",
        body: $body,
        in_reply_to_id: 456,
        pull_request_review_id: 789
      }'
    return
  fi

  local endpoint="$2"
  printf 'GET %s\n' "$endpoint" >>"$MOCK_GH_LOG"
  case "$endpoint" in
  "repos/ClipboardHealth/core-utils/pulls/comments/123")
    if [ "$MOCK_SCENARIO" = "verification-api-failure" ]; then
      printf 'verification failed\n' >&2
      return 1
    fi
    jq -n \
      --arg body "$(cat "$MOCK_REQUEST_BODY")" \
      '{
        id: 123,
        html_url: "https://github.com/ClipboardHealth/core-utils/pull/42#discussion_r123",
        body: $body,
        in_reply_to_id: 456,
        pull_request_review_id: 789
      }'
    ;;
  "repos/ClipboardHealth/core-utils/pulls/42/reviews/789")
    if [ "$MOCK_SCENARIO" = "pending-review" ]; then
      printf '{"id":789,"state":"PENDING","submitted_at":null}\n'
    else
      printf '{"id":789,"state":"COMMENTED","submitted_at":"2026-07-29T12:00:00Z"}\n'
    fi
    ;;
  *)
    printf 'Unexpected API read: %s\n' "$endpoint" >&2
    return 1
    ;;
  esac
}
export -f gh

run_helper() {
  local scenario="$1"
  local body="$2"
  local output_file="$3"
  local error_file="$4"
  export MOCK_SCENARIO="$scenario"
  export MOCK_GH_LOG="${TEST_TMP_DIR}/${scenario}.calls"
  export MOCK_REQUEST_BODY="${TEST_TMP_DIR}/${scenario}.body"
  : >"$MOCK_GH_LOG"

  bash "$SCRIPT" ClipboardHealth core-utils 42 456 "$body" >"$output_file" 2>"$error_file"
}

test_successful_publication() {
  local output_file="${TEST_TMP_DIR}/success.out"
  local error_file="${TEST_TMP_DIR}/success.err"
  if ! run_helper "success" "Addressed in commit." "$output_file" "$error_file"; then
    fail "published reply should succeed: $(cat "$error_file")"
  fi

  assert_equals \
    "https://github.com/ClipboardHealth/core-utils/pull/42#discussion_r123" \
    "$(cat "$output_file")" \
    "published reply URL"
  assert_equals \
    "Addressed in commit.

${SENTINEL}" \
    "$(cat "$MOCK_REQUEST_BODY")" \
    "sentinel-appended body"
  assert_file_contains \
    "$MOCK_GH_LOG" \
    "GET repos/ClipboardHealth/core-utils/pulls/comments/123" \
    "created comment is read back"
  assert_file_contains \
    "$MOCK_GH_LOG" \
    "GET repos/ClipboardHealth/core-utils/pulls/42/reviews/789" \
    "associated review is verified"
}

test_existing_sentinel_is_not_duplicated() {
  local output_file="${TEST_TMP_DIR}/sentinel.out"
  local error_file="${TEST_TMP_DIR}/sentinel.err"
  local body="Already fixed.

${SENTINEL}"
  if ! run_helper "sentinel" "$body" "$output_file" "$error_file"; then
    fail "reply with sentinel should succeed: $(cat "$error_file")"
  fi

  assert_equals "$body" "$(cat "$MOCK_REQUEST_BODY")" "existing sentinel body"
  assert_equals \
    "1" \
    "$(grep -Fc 'cb-babysit:addressed v1' "$MOCK_REQUEST_BODY")" \
    "sentinel count"
}

test_create_api_failure() {
  local output_file="${TEST_TMP_DIR}/create-failure.out"
  local error_file="${TEST_TMP_DIR}/create-failure.err"
  if run_helper "create-failure" "Addressed." "$output_file" "$error_file"; then
    fail "create API failure should fail"
  fi

  assert_file_contains "$error_file" "creation failed" "create API error"
  assert_file_excludes "$MOCK_GH_LOG" "GET " "verification after create failure"
}

test_verification_api_failure() {
  local output_file="${TEST_TMP_DIR}/verification-failure.out"
  local error_file="${TEST_TMP_DIR}/verification-failure.err"
  if run_helper "verification-api-failure" "Addressed." "$output_file" "$error_file"; then
    fail "verification API failure should fail"
  fi

  assert_file_contains "$error_file" "verification failed" "verification API error"
}

test_pending_reply_fails_without_submitting_reviews() {
  local output_file="${TEST_TMP_DIR}/pending.out"
  local error_file="${TEST_TMP_DIR}/pending.err"
  if run_helper "pending-review" "Addressed." "$output_file" "$error_file"; then
    fail "pending reply should fail verification"
  fi

  assert_file_contains "$error_file" "not published" "pending publication error"
  assert_file_excludes "$MOCK_GH_LOG" "/events" "pending review submission"
  assert_file_excludes "$MOCK_GH_LOG" "reviews/999" "unrelated pending review access"
}

test_successful_publication
test_existing_sentinel_is_not_duplicated
test_create_api_failure
test_verification_api_failure
test_pending_reply_fails_without_submitting_reviews

printf 'postSentinelReply tests passed\n'
