#!/usr/bin/env bash

set -uo pipefail

AWS_PROFILE_NAME="${1:-${AWS_PROFILE:-sdlc}}"
STAGING_HEALTH_URL="${2:-https://apigateway.staging.clipboardhealth.org/api/healthCheck}"

passed=0
failed=0

print_pass() {
  printf 'PASS: %s\n' "$1"
  passed=$((passed + 1))
}

print_fail() {
  printf 'FAIL: %s\n' "$1"
  failed=$((failed + 1))
}

print_failure_details() {
  local command_text="$1"
  local exit_code="$2"
  local output="$3"

  printf '  Command: %s\n' "$command_text"
  printf '  Exit: %s\n' "$exit_code"
  if [[ -n "$output" ]]; then
    printf '  Output:\n'
    printf '%s\n' "$output" | sed -n '1,6p' | sed 's/^/    /'
  fi
}

printf 'Checking flaky deep-dive prerequisites...\n'

timeout_command=""
if command -v gtimeout >/dev/null 2>&1; then
  timeout_command="gtimeout"
elif command -v timeout >/dev/null 2>&1; then
  timeout_command="timeout"
else
  print_fail "No timeout utility is installed."
  printf '  Remediation: install GNU coreutils so remote credential checks fail within a bounded time.\n'
fi

if ! command -v pup >/dev/null 2>&1; then
  print_fail "pup is not installed."
  printf '  Remediation: install pup, then authenticate with pup auth login or provide DD_API_KEY and DD_APP_KEY.\n'
elif [[ -n "$timeout_command" ]]; then
  trace_output="$(
    "$timeout_command" 30 pup traces search \
      --query='service:cbh-backend-main env:staging' \
      --from=15m \
      --limit=1 \
      --read-only \
      --no-agent \
      --jq='.data | length' 2>&1
  )"
  trace_exit_code=$?
  if [[ "$trace_exit_code" -eq 0 ]]; then
    print_pass "Datadog APM read access works through pup."
  else
    print_fail "pup cannot read staging APM spans."
    print_failure_details \
      "pup traces search --query='service:cbh-backend-main env:staging' --from=15m --limit=1" \
      "$trace_exit_code" \
      "$trace_output"
    printf '  Remediation: run pup auth login, provide DD_API_KEY and DD_APP_KEY, or request APM read access for 401/403 failures.\n'
  fi

  logs_output="$(
    "$timeout_command" 30 pup logs search \
      --query='service:cbh-backend-main env:staging' \
      --from=15m \
      --limit=1 \
      --read-only \
      --no-agent \
      --jq='.data | length' 2>&1
  )"
  logs_exit_code=$?
  if [[ "$logs_exit_code" -eq 0 ]]; then
    print_pass "Datadog log read access works through pup."
  else
    print_fail "pup cannot read staging logs."
    print_failure_details \
      "pup logs search --query='service:cbh-backend-main env:staging' --from=15m --limit=1" \
      "$logs_exit_code" \
      "$logs_output"
    printf '  Remediation: run pup auth login, provide DD_API_KEY and DD_APP_KEY, or request log read access for 401/403 failures.\n'
  fi
fi

if ! command -v curl >/dev/null 2>&1; then
  print_fail "curl is not installed."
  printf '  Remediation: install curl and retry while connected to the non-production VPN.\n'
else
  staging_output="$(
    curl \
      --silent \
      --show-error \
      --write-out '\n%{http_code}' \
      --connect-timeout 10 \
      --max-time 20 \
      "$STAGING_HEALTH_URL" 2>&1
  )"
  curl_exit_code=$?
  staging_status="$(printf '%s\n' "$staging_output" | tail -n 1)"
  staging_body="$(printf '%s\n' "$staging_output" | sed '$d')"

  if [[ "$curl_exit_code" -eq 0 && "$staging_status" == "200" ]] &&
    printf '%s\n' "$staging_body" | grep -Eq '"message"[[:space:]]*:[[:space:]]*"OK"'; then
    print_pass "Staging health is reachable through the VPN (HTTP 200, message OK)."
  else
    print_fail "Staging health is not reachable through the VPN."
    print_failure_details \
      "curl --connect-timeout 10 --max-time 20 $STAGING_HEALTH_URL" \
      "$curl_exit_code" \
      "$staging_output"
    printf '  Remediation: connect the Clipboard Health non-production VPN. If this environment cannot use the VPN, request a VPN-capable investigation environment.\n'
  fi
fi

if ! command -v aws >/dev/null 2>&1; then
  print_fail "AWS CLI is not installed."
  printf '  Remediation: install AWS CLI v2 and configure the sdlc SSO profile.\n'
else
  aws_identity_output="$(
    aws sts get-caller-identity \
      --profile "$AWS_PROFILE_NAME" \
      --query Account \
      --output text \
      --cli-connect-timeout 10 \
      --cli-read-timeout 20 2>&1
  )"
  aws_identity_exit_code=$?

  if [[ "$aws_identity_exit_code" -eq 0 && -n "$aws_identity_output" && "$aws_identity_output" != "None" ]]; then
    print_pass "AWS credentials are active for profile $AWS_PROFILE_NAME (account $aws_identity_output)."

    aws_read_output="$(
      aws cloudwatch list-metrics \
        --profile "$AWS_PROFILE_NAME" \
        --region us-west-2 \
        --max-items 1 \
        --output json \
        --cli-connect-timeout 10 \
        --cli-read-timeout 20 2>&1
    )"
    aws_read_exit_code=$?
    if [[ "$aws_read_exit_code" -eq 0 ]]; then
      print_pass "AWS read access works for profile $AWS_PROFILE_NAME."
    else
      print_fail "AWS credentials lack the staging read access required by the deep-dive track."
      print_failure_details \
        "aws cloudwatch list-metrics --profile $AWS_PROFILE_NAME --region us-west-2 --max-items 1" \
        "$aws_read_exit_code" \
        "$aws_read_output"
      printf '  Remediation: request staging read permissions, then rerun the preflight.\n'
    fi
  else
    print_fail "AWS credentials are unavailable for profile $AWS_PROFILE_NAME."
    print_failure_details \
      "aws sts get-caller-identity --profile $AWS_PROFILE_NAME" \
      "$aws_identity_exit_code" \
      "$aws_identity_output"
    printf '  Remediation: run aws sso login --profile %s. If the profile is missing, request staging read access and configure it first.\n' "$AWS_PROFILE_NAME"
  fi
fi

printf '\nSummary: %s passed, %s failed.\n' "$passed" "$failed"

if [[ "$failed" -gt 0 ]]; then
  printf '\nDo not proceed with the deep dive. File a provisioning ticket linked to the chronic flake ticket and include the failed checks above.\n'
  exit 1
fi

printf 'All credential preconditions are satisfied.\n'
