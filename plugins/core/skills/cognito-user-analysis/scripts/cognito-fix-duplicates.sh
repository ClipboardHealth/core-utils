#!/bin/bash
# Execute duplicate fixes: delete old users, update kept user
set -uo pipefail

show_help() {
  cat << 'EOF'
Execute fixes for duplicate Cognito users.

Deletes users marked DELETE and updates users marked KEEP_AND_UPDATE with
backend data and resets backend_sync_counter to 0.

USAGE:
  cognito-fix-duplicates.sh [OPTIONS] <analysis_csv> [profile] [pool_id]

ARGUMENTS:
  analysis_csv  CSV from cognito-analyze-duplicates.sh (required)
  profile       AWS profile name (default: cbh-production-platform)
  pool_id       Cognito user pool ID (default: us-west-2_in7ey5PCw)

OPTIONS:
  -h, --help    Show this help message
  --dry-run     Show what would be done without making changes

ACTIONS:
  DELETE           Permanently removes the Cognito user
  KEEP_AND_UPDATE  Updates user attributes with backend data:
                   - phone_number
                   - email (+ email_verified=true)
                   - custom:cbh_user_id
                   - custom:backend_sync_counter=0

WARNING:
  Deleted users cannot be recovered. Always run with --dry-run first!

EXAMPLES:
  cognito-fix-duplicates.sh analysis.csv --dry-run
  cognito-fix-duplicates.sh analysis.csv
  cognito-fix-duplicates.sh analysis.csv cbh-production-platform us-west-2_in7ey5PCw --dry-run
EOF
}

if [[ "${1:-}" == "-h" || "${1:-}" == "--help" ]]; then
  show_help
  exit 0
fi

ANALYSIS_FILE="${1:?Error: analysis_csv required. Run with --help for usage.}"
PROFILE="${2:-cbh-production-platform}"
USER_POOL_ID="${3:-us-west-2_in7ey5PCw}"
DRY_RUN=""

# Check for --dry-run in any position
for arg in "$@"; do
  if [[ "$arg" == "--dry-run" ]]; then
    DRY_RUN="--dry-run"
  fi
done

if [[ ! -f "$ANALYSIS_FILE" ]]; then
  echo "Error: Analysis file '$ANALYSIS_FILE' not found" >&2
  exit 1
fi

if [[ -n "$DRY_RUN" ]]; then
  echo "=== DRY RUN MODE - No changes will be made ==="
  echo ""
fi

normalize_phone_e164() {
  local phone="$1"
  # Extract digits only
  local digits=$(echo "$phone" | tr -cd '0-9')
  # If 10 digits, assume US and add +1
  if [[ ${#digits} -eq 10 ]]; then
    echo "+1${digits}"
  # If 11 digits starting with 1, add +
  elif [[ ${#digits} -eq 11 && "${digits:0:1}" == "1" ]]; then
    echo "+${digits}"
  # If already has country code (11+ digits), add +
  elif [[ ${#digits} -ge 11 ]]; then
    echo "+${digits}"
  else
    # Return as-is if we can't normalize
    echo "$phone"
  fi
}

delete_user() {
  local username="$1"
  if [[ -n "$DRY_RUN" ]]; then
    echo "[DRY-RUN] Would delete user: $username"
  else
    echo "Deleting user: $username"
    aws cognito-idp admin-delete-user \
      --user-pool-id "$USER_POOL_ID" \
      --profile "$PROFILE" \
      --username "$username" 2>&1
  fi
}

update_user() {
  local username="$1"
  local phone="$2"
  local email="$3"
  local cbh_user_id="$4"

  local attrs=()

  if [[ -n "$phone" ]]; then
    local normalized_phone=$(normalize_phone_e164 "$phone")
    attrs+=("Name=phone_number,Value=$normalized_phone")
  fi

  if [[ -n "$email" ]]; then
    attrs+=("Name=email,Value=$email")
    attrs+=("Name=email_verified,Value=true")
  fi

  if [[ -n "$cbh_user_id" ]]; then
    attrs+=("Name=custom:cbh_user_id,Value=$cbh_user_id")
  fi

  attrs+=("Name=custom:backend_sync_counter,Value=0")

  if [[ -n "$DRY_RUN" ]]; then
    echo "[DRY-RUN] Would update user: $username"
    echo "  Attributes: ${attrs[*]}"
  else
    echo "Updating user: $username"
    echo "  Attributes: ${attrs[*]}"
    aws cognito-idp admin-update-user-attributes \
      --user-pool-id "$USER_POOL_ID" \
      --profile "$PROFILE" \
      --username "$username" \
      --user-attributes "${attrs[@]}" 2>&1
  fi
}

deleted=0
updated=0

while IFS=, read -r sub username phone email cbh_user_id status created last_modified action match_score match_details backend_phone backend_email backend_cbh_user_id backend_name duplicate_group; do
  [[ -z "$sub" ]] && continue

  case "$action" in
    DELETE)
      delete_user "$username"
      (( ++deleted ))
      ;;
    KEEP_AND_UPDATE)
      update_phone="${backend_phone:-$phone}"
      update_email="${backend_email:-$email}"
      update_cbh_user_id="${backend_cbh_user_id:-$cbh_user_id}"

      update_user "$username" "$update_phone" "$update_email" "$update_cbh_user_id"
      (( ++updated ))
      ;;
    *)
      echo "Unknown action: $action for $username"
      ;;
  esac
done < <(tail -n +2 "$ANALYSIS_FILE")

echo ""
echo "Summary:"
echo "  Deleted: $deleted users"
echo "  Updated: $updated users"

if [[ -n "$DRY_RUN" ]]; then
  echo ""
  echo "This was a dry run. Run without --dry-run to apply changes."
fi
