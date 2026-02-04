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

## Troubleshooting

| Error                    | Solution                                           |
| ------------------------ | -------------------------------------------------- |
| "Credentials expired"    | `aws sso login --profile cbh-production-platform`  |
| "403 Forbidden" from API | Get fresh token from web app                       |
| "Cannot access Cognito"  | Check IAM permissions or contact platform team     |
