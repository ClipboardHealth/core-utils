#!/bin/bash
# Find duplicate Cognito users by phone/email
set -uo pipefail

show_help() {
  cat << 'EOF'
Find duplicate Cognito users sharing the same phone number or email.

USAGE:
  cognito-find-duplicates.sh [OPTIONS] <input_csv> [output_file] [profile] [pool_id]

ARGUMENTS:
  input_csv    CSV from cognito-lookup.sh (required)
  output_file  Output CSV path (default: cognito-duplicates.csv)
  profile      AWS profile name (default: cbh-production-platform)
  pool_id      Cognito user pool ID (default: us-west-2_in7ey5PCw)

OPTIONS:
  -h, --help   Show this help message

INPUT FORMAT:
  CSV with columns: sub,username,phone,email,cbh_user_id

OUTPUT FORMAT:
  CSV with columns: original_sub,original_username,search_type,search_value,duplicate_usernames,duplicate_subs
  Only rows with duplicates are included.

EXAMPLES:
  cognito-find-duplicates.sh results.csv
  cognito-find-duplicates.sh results.csv duplicates.csv
EOF
}

if [[ "${1:-}" == "-h" || "${1:-}" == "--help" ]]; then
  show_help
  exit 0
fi

INPUT_FILE="${1:?Error: input_csv required. Run with --help for usage.}"
OUTPUT_FILE="${2:-cognito-duplicates.csv}"
PROFILE="${3:-cbh-production-platform}"
USER_POOL_ID="${4:-us-west-2_in7ey5PCw}"

if [[ ! -f "$INPUT_FILE" ]]; then
  echo "Error: Input file '$INPUT_FILE' not found" >&2
  exit 1
fi

echo "original_sub,original_username,search_type,search_value,duplicate_usernames,duplicate_subs" > "$OUTPUT_FILE"

# shellcheck disable=SC2034 # cbh_user_id is read for CSV structure but unused
tail -n +2 "$INPUT_FILE" | while IFS=, read -r sub username phone email cbh_user_id; do
  [[ -z "$sub" ]] && continue

  if [[ -n "$phone" ]]; then
    phone_results=$(aws cognito-idp list-users \
      --user-pool-id "$USER_POOL_ID" \
      --profile "$PROFILE" \
      --filter "phone_number = \"$phone\"" \
      --query 'Users[].{Username:Username, Sub:Attributes[?Name==`sub`].Value|[0]}' \
      --output json 2>/dev/null) || phone_results="[]"

    phone_count="$(echo "$phone_results" | jq 'length')"
    if [[ "$phone_count" -gt 1 ]]; then
      other_usernames="$(echo "$phone_results" | jq -r --arg orig "$username" '[.[] | select(.Username != $orig) | .Username] | join(";")')" || other_usernames=""
      other_subs="$(echo "$phone_results" | jq -r --arg orig "$sub" '[.[] | select(.Sub != $orig) | .Sub] | join(";")')" || other_subs=""
      if [[ -n "$other_usernames" ]]; then
        echo "$sub,$username,phone,$phone,$other_usernames,$other_subs" >> "$OUTPUT_FILE"
        echo "✓ Duplicate phone: $phone ($phone_count users)"
      fi
    fi
  fi

  if [[ -n "$email" ]]; then
    email_results=$(aws cognito-idp list-users \
      --user-pool-id "$USER_POOL_ID" \
      --profile "$PROFILE" \
      --filter "email = \"$email\"" \
      --query 'Users[].{Username:Username, Sub:Attributes[?Name==`sub`].Value|[0]}' \
      --output json 2>/dev/null) || email_results="[]"

    email_count="$(echo "$email_results" | jq 'length')"
    if [[ "$email_count" -gt 1 ]]; then
      other_usernames="$(echo "$email_results" | jq -r --arg orig "$username" '[.[] | select(.Username != $orig) | .Username] | join(";")')" || other_usernames=""
      other_subs="$(echo "$email_results" | jq -r --arg orig "$sub" '[.[] | select(.Sub != $orig) | .Sub] | join(";")')" || other_subs=""
      if [[ -n "$other_usernames" ]]; then
        echo "$sub,$username,email,$email,$other_usernames,$other_subs" >> "$OUTPUT_FILE"
        echo "✓ Duplicate email: $email ($email_count users)"
      fi
    fi
  fi
done

echo ""
echo "Results saved to: $OUTPUT_FILE"
result_count=$(($(wc -l < "$OUTPUT_FILE") - 1))
echo "Duplicates found: $result_count"
