# Prerequisites Setup

## Quick Check

```bash
scripts/check-prerequisites.sh
```

This validates all requirements and shows how to fix failures.

## AWS Profile

```bash
# Configure SSO (recommended)
aws configure sso --profile cbh-production-platform
# SSO URL: https://clipboard.awsapps.com/start
# Region: us-west-2

# Login (run when credentials expire)
aws sso login --profile cbh-production-platform

# Verify
aws sts get-caller-identity --profile cbh-production-platform
```

## CBH API Token

1. Open <https://app.clipboard.health>
2. Open DevTools (F12) → Network tab
3. Make any action, find request to `api.clipboard.health`
4. Copy `Authorization` header value

```bash
echo 'your_token_here' > ~/.cbh_token
chmod 600 ~/.cbh_token
```

Token expires periodically. If you get `403 Forbidden`, get a fresh token.

## Cognito User Pool ID

The scripts default to production pool ID. To find pool IDs for other environments:

```bash
# List all Cognito user pools
aws cognito-idp list-user-pools \
  --profile cbh-production-platform \
  --max-results 10 \
  --query 'UserPools[].{Name:Name, Id:Id}' \
  --output table

# Or filter by name pattern
aws cognito-idp list-user-pools \
  --profile cbh-production-platform \
  --max-results 10 \
  --query 'UserPools[?contains(Name, `production`)].{Name:Name, Id:Id}' \
  --output table
```

Pass the pool ID as a parameter to override the default:

```bash
scripts/cognito-lookup.sh subs.txt results.csv cbh-staging-platform us-west-2_XXXXX
```

## Troubleshooting

| Error                    | Solution                                           |
| ------------------------ | -------------------------------------------------- |
| "Credentials expired"    | `aws sso login --profile cbh-production-platform`  |
| "403 Forbidden" from API | Get fresh token from web app                       |
| "Cannot access Cognito"  | Check IAM permissions or contact platform team     |
