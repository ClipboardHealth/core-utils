#!/bin/bash
# Analyze duplicate Cognito users with backend data comparison
set -uo pipefail

show_help() {
  cat << 'EOF'
Analyze duplicate Cognito users by comparing against backend data.

Determines which account to KEEP (highest match score) and which to DELETE.

USAGE:
  cognito-analyze-duplicates.sh [OPTIONS] <duplicates_csv> [output_file] [profile] [pool_id]

ARGUMENTS:
  duplicates_csv  CSV from cognito-find-duplicates.sh (required)
  output_file     Output CSV path (default: cognito-duplicate-analysis.csv)
  profile         AWS profile name (default: cbh-production-platform)
  pool_id         Cognito user pool ID (default: us-west-2_in7ey5PCw)

OPTIONS:
  -h, --help      Show this help message

PREREQUISITES:
  ~/.cbh_token    File containing CBH API token (get from web app dev tools)

SCORING ALGORITHM:
  +100 points    cbh_user_id matches backend userId
  +50 points     Email matches backend (case-insensitive)
  +25 points     Phone matches backend (normalized)
  +10 points     Account status is CONFIRMED

  Highest score = KEEP_AND_UPDATE
  Lower scores  = DELETE

OUTPUT COLUMNS:
  sub, username, phone, email, cbh_user_id, status, created, last_modified,
  action, match_score, match_details, backend_phone, backend_email,
  backend_cbh_user_id, backend_name, duplicate_group

EXAMPLES:
  cognito-analyze-duplicates.sh duplicates.csv
  cognito-analyze-duplicates.sh duplicates.csv analysis.csv
EOF
}

if [[ "${1:-}" == "-h" || "${1:-}" == "--help" ]]; then
  show_help
  exit 0
fi

DUPLICATES_FILE="${1:?Error: duplicates_csv required. Run with --help for usage.}"
OUTPUT_FILE="${2:-cognito-duplicate-analysis.csv}"
PROFILE="${3:-cbh-production-platform}"
USER_POOL_ID="${4:-us-west-2_in7ey5PCw}"

TOKEN_FILE="$HOME/.cbh_token"
API_BASE="https://api.clipboard.health/api/user/agentSearch"

if [[ ! -f "$DUPLICATES_FILE" ]]; then
  echo "Error: Duplicates file '$DUPLICATES_FILE' not found" >&2
  exit 1
fi

if [[ ! -f "$TOKEN_FILE" ]]; then
  echo "Error: Token file '$TOKEN_FILE' not found" >&2
  echo "Create it: echo 'your_token' > ~/.cbh_token" >&2
  exit 1
fi

TOKEN=$(cat "$TOKEN_FILE")

echo "sub,username,phone,email,cbh_user_id,status,created,last_modified,action,match_score,match_details,backend_phone,backend_email,backend_cbh_user_id,backend_name,duplicate_group" > "$OUTPUT_FILE"

get_user_details() {
  local username="$1"
  aws cognito-idp admin-get-user \
    --user-pool-id "$USER_POOL_ID" \
    --profile "$PROFILE" \
    --username "$username" \
    --output json 2>/dev/null
}

query_backend() {
  local search_input="$1"
  local clean_input="${search_input#+1}"
  curl -s "${API_BASE}?skip=0&limit=5&searchInput=${clean_input}" \
    -H "Authorization: ${TOKEN}" 2>/dev/null
}

normalize_phone() {
  echo "$1" | tr -cd '0-9'
}

calculate_match_score() {
  local cognito_phone="$1"
  local cognito_email="$2"
  local cognito_cbh_user_id="$3"
  local cognito_status="$4"
  local backend_phone="$5"
  local backend_email="$6"
  local backend_cbh_user_id="$7"

  local score=0
  local details=""

  if [[ -n "$cognito_cbh_user_id" && -n "$backend_cbh_user_id" ]]; then
    if [[ "$cognito_cbh_user_id" == "$backend_cbh_user_id" ]]; then
      score=$((score + 100))
      details="${details}cbh_user_id:MATCH;"
    else
      details="${details}cbh_user_id:MISMATCH;"
    fi
  elif [[ -z "$cognito_cbh_user_id" ]]; then
    details="${details}cbh_user_id:MISSING;"
  fi

  if [[ -n "$cognito_email" && -n "$backend_email" ]]; then
    local cognito_email_lower=$(echo "$cognito_email" | tr '[:upper:]' '[:lower:]')
    local backend_email_lower=$(echo "$backend_email" | tr '[:upper:]' '[:lower:]')
    if [[ "$cognito_email_lower" == "$backend_email_lower" ]]; then
      score=$((score + 50))
      details="${details}email:MATCH;"
    else
      details="${details}email:MISMATCH;"
    fi
  elif [[ -z "$cognito_email" ]]; then
    details="${details}email:MISSING;"
  fi

  if [[ -n "$cognito_phone" && -n "$backend_phone" ]]; then
    local cognito_phone_norm=$(normalize_phone "$cognito_phone")
    local backend_phone_norm=$(normalize_phone "$backend_phone")
    cognito_phone_norm="${cognito_phone_norm: -10}"
    backend_phone_norm="${backend_phone_norm: -10}"
    if [[ "$cognito_phone_norm" == "$backend_phone_norm" ]]; then
      score=$((score + 25))
      details="${details}phone:MATCH;"
    else
      details="${details}phone:MISMATCH;"
    fi
  elif [[ -z "$cognito_phone" ]]; then
    details="${details}phone:MISSING;"
  fi

  if [[ "$cognito_status" == "CONFIRMED" ]]; then
    score=$((score + 10))
    details="${details}status:CONFIRMED;"
  else
    details="${details}status:$cognito_status;"
  fi

  echo "$score|$details"
}

group_id=0

tail -n +2 "$DUPLICATES_FILE" | while IFS=, read -r original_sub original_username search_type search_value duplicate_usernames duplicate_subs; do
  [[ -z "$original_sub" ]] && continue
  ((group_id++))

  echo "Processing duplicate group $group_id: $search_type=$search_value"

  all_subs=("$original_sub")
  all_usernames=("$original_username")

  IFS=';' read -ra dup_usernames <<< "$duplicate_usernames"
  IFS=';' read -ra dup_subs <<< "$duplicate_subs"

  for i in "${!dup_usernames[@]}"; do
    all_usernames+=("${dup_usernames[$i]}")
    all_subs+=("${dup_subs[$i]}")
  done

  backend_response=$(query_backend "$search_value")
  backend_phone=""
  backend_email=""
  backend_cbh_user_id=""
  backend_name=""

  if [[ -n "$backend_response" ]]; then
    error_status=$(echo "$backend_response" | jq -r '.statusCode // ""' 2>/dev/null)
    if [[ -n "$error_status" && "$error_status" != "null" ]]; then
      echo "  Warning: Backend API error: $(echo "$backend_response" | jq -r '.message // "Unknown"')"
    else
      backend_phone=$(echo "$backend_response" | jq -r '.list[0].phone // ""' 2>/dev/null) || backend_phone=""
      backend_email=$(echo "$backend_response" | jq -r '.list[0].email // ""' 2>/dev/null) || backend_email=""
      backend_cbh_user_id=$(echo "$backend_response" | jq -r '.list[0].userId // ""' 2>/dev/null) || backend_cbh_user_id=""
      backend_name=$(echo "$backend_response" | jq -r '.list[0].name // ""' 2>/dev/null) || backend_name=""

      if [[ -n "$backend_cbh_user_id" && "$backend_cbh_user_id" != "null" ]]; then
        echo "  Backend: $backend_name ($backend_email) - userId: $backend_cbh_user_id"
      else
        echo "  Warning: No backend user found for $search_value"
      fi
    fi
  fi

  declare -A user_data
  declare -A user_scores
  best_score=-1
  best_username=""

  for i in "${!all_usernames[@]}"; do
    username="${all_usernames[$i]}"
    sub="${all_subs[$i]}"

    details=$(get_user_details "$username")
    if [[ -n "$details" && "$details" != "null" ]]; then
      last_modified=$(echo "$details" | jq -r '.UserLastModifiedDate // ""')
      created=$(echo "$details" | jq -r '.UserCreateDate // ""')
      status=$(echo "$details" | jq -r '.UserStatus // ""')
      phone=$(echo "$details" | jq -r '(.UserAttributes // [])[] | select(.Name=="phone_number") | .Value' 2>/dev/null) || phone=""
      email=$(echo "$details" | jq -r '(.UserAttributes // [])[] | select(.Name=="email") | .Value' 2>/dev/null) || email=""
      cbh_user_id=$(echo "$details" | jq -r '(.UserAttributes // [])[] | select(.Name=="custom:cbh_user_id") | .Value' 2>/dev/null) || cbh_user_id=""

      user_data["${username}_sub"]="$sub"
      user_data["${username}_phone"]="$phone"
      user_data["${username}_email"]="$email"
      user_data["${username}_cbh_user_id"]="$cbh_user_id"
      user_data["${username}_status"]="$status"
      user_data["${username}_created"]="$created"
      user_data["${username}_last_modified"]="$last_modified"

      score_result=$(calculate_match_score "$phone" "$email" "$cbh_user_id" "$status" "$backend_phone" "$backend_email" "$backend_cbh_user_id")
      score=$(echo "$score_result" | cut -d'|' -f1)
      match_details=$(echo "$score_result" | cut -d'|' -f2)

      user_scores["${username}_score"]="$score"
      user_scores["${username}_details"]="$match_details"

      echo "  User $username: score=$score ($match_details)"

      if [[ "$score" -gt "$best_score" ]]; then
        best_score="$score"
        best_username="$username"
      elif [[ "$score" -eq "$best_score" && -n "$best_username" ]]; then
        best_last_modified="${user_data["${best_username}_last_modified"]}"
        if [[ "$last_modified" > "$best_last_modified" ]]; then
          best_username="$username"
        fi
      fi
    fi
  done

  echo "  Decision: KEEP $best_username (score: $best_score)"

  for username in "${all_usernames[@]}"; do
    sub="${user_data["${username}_sub"]}"
    phone="${user_data["${username}_phone"]}"
    email="${user_data["${username}_email"]}"
    cbh_user_id="${user_data["${username}_cbh_user_id"]}"
    status="${user_data["${username}_status"]}"
    created="${user_data["${username}_created"]}"
    last_modified="${user_data["${username}_last_modified"]}"
    score="${user_scores["${username}_score"]}"
    match_details="${user_scores["${username}_details"]}"

    if [[ "$username" == "$best_username" ]]; then
      action="KEEP_AND_UPDATE"
    else
      action="DELETE"
    fi

    backend_name_escaped="${backend_name//,/ }"
    echo "$sub,$username,$phone,$email,$cbh_user_id,$status,$created,$last_modified,$action,$score,$match_details,$backend_phone,$backend_email,$backend_cbh_user_id,$backend_name_escaped,$group_id" >> "$OUTPUT_FILE"
  done

  unset user_data
  unset user_scores
  declare -A user_data
  declare -A user_scores

done

echo ""
echo "Analysis saved to: $OUTPUT_FILE"
echo "Review the file before executing fixes!"
