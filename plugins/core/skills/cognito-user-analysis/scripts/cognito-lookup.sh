#!/bin/bash
# Lookup Cognito users by sub
set -euo pipefail

show_help() {
  cat << 'EOF'
Look up Cognito users by their sub (UUID) and output user details.

USAGE:
  cognito-lookup.sh [OPTIONS] <input_file> [output_file] [profile] [pool_id]

ARGUMENTS:
  input_file   File with one Cognito sub per line (required)
  output_file  Output CSV path (default: cognito-results.csv)
  profile      AWS profile name (default: cbh-production-platform)
  pool_id      Cognito user pool ID (default: us-west-2_in7ey5PCw)

OPTIONS:
  -h, --help   Show this help message

OUTPUT FORMAT:
  CSV with columns: sub,username,phone,email,cbh_user_id

EXAMPLES:
  cognito-lookup.sh subs.txt
  cognito-lookup.sh subs.txt results.csv
  cognito-lookup.sh subs.txt results.csv cbh-production-platform
EOF
}

if [[ "${1:-}" == "-h" || "${1:-}" == "--help" ]]; then
  show_help
  exit 0
fi

INPUT_FILE="${1:?Error: input_file required. Run with --help for usage.}"
OUTPUT_FILE="${2:-cognito-results.csv}"
PROFILE="${3:-cbh-production-platform}"
USER_POOL_ID="${4:-us-west-2_in7ey5PCw}"

if [[ ! -f "$INPUT_FILE" ]]; then
  echo "Error: Input file '$INPUT_FILE' not found" >&2
  exit 1
fi

echo "sub,username,phone,email,cbh_user_id" > "$OUTPUT_FILE"

total=$(wc -l < "$INPUT_FILE")
count=0

while IFS= read -r sub || [[ -n "$sub" ]]; do
  [[ -z "$sub" ]] && continue
  ((count++))

  result=$(aws cognito-idp list-users \
    --user-pool-id "$USER_POOL_ID" \
    --profile "$PROFILE" \
    --filter "sub = \"$sub\"" \
    --query 'Users[0].{Username:Username, Attributes:Attributes}' \
    --output json 2>/dev/null) || true

  if [[ "$result" != "null" && -n "$result" ]]; then
    username=$(echo "$result" | jq -r '.Username // ""')
    phone=$(echo "$result" | jq -r '(.Attributes // [])[] | select(.Name=="phone_number") | .Value' 2>/dev/null) || phone=""
    email=$(echo "$result" | jq -r '(.Attributes // [])[] | select(.Name=="email") | .Value' 2>/dev/null) || email=""
    cbh_user_id=$(echo "$result" | jq -r '(.Attributes // [])[] | select(.Name=="custom:cbh_user_id") | .Value' 2>/dev/null) || cbh_user_id=""
    printf '%s,"%s","%s","%s","%s"\n' "$sub" "$username" "$phone" "$email" "$cbh_user_id" >> "$OUTPUT_FILE"
    echo "[$count/$total] ✓ $sub"
  else
    printf '%s,"NOT_FOUND","","",""\n' "$sub" >> "$OUTPUT_FILE"
    echo "[$count/$total] ✗ $sub (not found)"
  fi
done < "$INPUT_FILE"

echo ""
echo "Results saved to: $OUTPUT_FILE"
echo "Total: $count users processed"
