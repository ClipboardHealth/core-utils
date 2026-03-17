#!/bin/bash
# Check prerequisites for Cognito user analysis
set -euo pipefail

show_help() {
  cat << 'EOF'
Check prerequisites for Cognito user analysis.

USAGE:
  check-prerequisites.sh [OPTIONS] [profile] [pool_id]

ARGUMENTS:
  profile     AWS profile name (default: cbh-production-platform)
  pool_id     Cognito user pool ID (default: us-west-2_in7ey5PCw)

OPTIONS:
  -h, --help  Show this help message

CHECKS PERFORMED:
  1. AWS CLI installed
  2. AWS profile exists with valid credentials
  3. Can access Cognito user pool
  4. ~/.cbh_token file exists and has valid permissions
  5. CBH API token is valid (not expired/403)

EXIT CODES:
  0  All prerequisites met
  1  One or more prerequisites failed

EXAMPLES:
  check-prerequisites.sh
  check-prerequisites.sh cbh-production-platform
  check-prerequisites.sh my-profile us-west-2_abc123
EOF
}

if [[ "${1:-}" == "-h" || "${1:-}" == "--help" ]]; then
  show_help
  exit 0
fi

PROFILE="${1:-cbh-production-platform}"
USER_POOL_ID="${2:-us-west-2_in7ey5PCw}"
TOKEN_FILE="$HOME/.cbh_token"
API_BASE="https://api.clipboard.health/api/user/agentSearch"

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

passed=0
failed=0

print_pass() { echo -e "${GREEN}✓${NC} $1"; (( ++passed )); }
print_fail() { echo -e "${RED}✗${NC} $1"; (( ++failed )); }
print_warn() { echo -e "${YELLOW}⚠${NC} $1"; }
print_section() { echo ""; echo "━━━ $1 ━━━"; }

# ─────────────────────────────────────────────────────────────────────────────
print_section "AWS CLI"

if command -v aws &> /dev/null; then
  aws_version=$(aws --version 2>&1 | head -1)
  print_pass "AWS CLI installed: $aws_version"
else
  print_fail "AWS CLI not installed"
  echo "    Install: https://docs.aws.amazon.com/cli/latest/userguide/getting-started-install.html"
fi

# ─────────────────────────────────────────────────────────────────────────────
print_section "AWS Profile: $PROFILE"

if aws configure list --profile "$PROFILE" &> /dev/null; then
  print_pass "Profile '$PROFILE' exists"
else
  print_fail "Profile '$PROFILE' not found"
  echo "    Create: aws configure sso --profile $PROFILE"
fi

if aws sts get-caller-identity --profile "$PROFILE" &> /dev/null; then
  account=$(aws sts get-caller-identity \
    --profile "$PROFILE" \
    --query 'Account' \
    --output text 2>/dev/null)
  account=${account:-unknown}
  print_pass "Credentials valid (Account: $account)"
else
  print_fail "Credentials expired or invalid"
  echo "    SSO login: aws sso login --profile $PROFILE"
fi

# ─────────────────────────────────────────────────────────────────────────────
print_section "Cognito Access: $USER_POOL_ID"

if aws cognito-idp describe-user-pool --user-pool-id "$USER_POOL_ID" --profile "$PROFILE" &> /dev/null; then
  pool_name=$(aws cognito-idp describe-user-pool --user-pool-id "$USER_POOL_ID" --profile "$PROFILE" --query 'UserPool.Name' --output text 2>/dev/null)
  print_pass "Can access Cognito pool: $pool_name"
elif aws cognito-idp list-users --user-pool-id "$USER_POOL_ID" --profile "$PROFILE" --limit 1 &> /dev/null; then
  print_pass "Can list users in Cognito pool"
else
  print_fail "Cannot access Cognito user pool"
  echo "    Required: cognito-idp:ListUsers, AdminGetUser, AdminDeleteUser, AdminUpdateUserAttributes"
fi

# ─────────────────────────────────────────────────────────────────────────────
print_section "CBH API Token: $TOKEN_FILE"

if [[ -f "$TOKEN_FILE" ]]; then
  print_pass "Token file exists"

  perms=$(stat -c %a "$TOKEN_FILE" 2>/dev/null || stat -f %A "$TOKEN_FILE" 2>/dev/null)
  if [[ "$perms" == "600" || "$perms" == "400" ]]; then
    print_pass "Token file permissions secure ($perms)"
  else
    print_warn "Token permissions ($perms) - recommend: chmod 600 $TOKEN_FILE"
  fi

  token=$(cat "$TOKEN_FILE" | tr -d '[:space:]')
  if [[ -z "$token" ]]; then
    print_fail "Token file is empty"
  else
    print_pass "Token present (${#token} chars)"
  fi
else
  print_fail "Token file not found"
  echo "    Create: echo 'your_token' > $TOKEN_FILE && chmod 600 $TOKEN_FILE"
fi

# ─────────────────────────────────────────────────────────────────────────────
print_section "CBH API Connectivity"

if [[ -f "$TOKEN_FILE" ]]; then
  token=$(cat "$TOKEN_FILE" | tr -d '[:space:]')
  response=$(curl -s -w "\n%{http_code}" --connect-timeout 10 --max-time 30 \
    "${API_BASE}?skip=0&limit=1&searchInput=test" \
    -H "Authorization: ${token}" 2>/dev/null || true)
  http_code=$(echo "$response" | tail -1)

  case "$http_code" in
    200) print_pass "API token valid (HTTP 200)" ;;
    401) print_fail "API token invalid (HTTP 401 Unauthorized)" ;;
    403) print_fail "API token expired (HTTP 403 Forbidden) - get new token from web app" ;;
    000) print_fail "Cannot reach API - check internet/VPN" ;;
    *)   print_fail "Unexpected API response (HTTP $http_code)" ;;
  esac
else
  print_warn "Skipping API test - token file not found"
fi

# ─────────────────────────────────────────────────────────────────────────────
print_section "Summary"

echo ""
if [[ $failed -eq 0 ]]; then
  echo -e "${GREEN}All prerequisites met!${NC} ($passed checks passed)"
  exit 0
else
  echo -e "${RED}$failed prerequisite(s) failed${NC} ($passed passed)"
  exit 1
fi
