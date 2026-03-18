# Fix Workflow

Execute fixes after reviewing `analysis.csv`.

## Always Dry-Run First

```bash
scripts/cognito-fix-duplicates.sh analysis.csv --dry-run
```

Review output to confirm correct users will be deleted/updated.

## Execute

```bash
scripts/cognito-fix-duplicates.sh analysis.csv
```

Run `--help` for all options.

## Actions

### DELETE

Permanently removes user from Cognito. **Irreversible.**

User must sign up again to create new account.

### KEEP_AND_UPDATE

Updates user attributes with backend data:

- `phone_number`
- `email` + `email_verified=true`
- `custom:cbh_user_id`
- `custom:backend_sync_counter=0`

## Verification

```bash
# Get pool ID (see setup.md for details)
POOL_ID="<your_pool_id>"
PROFILE="cbh-production-platform"

# Confirm deleted user is gone
aws cognito-idp admin-get-user \
  --user-pool-id "$POOL_ID" \
  --profile "$PROFILE" \
  --username <deleted_username>
# Should return: "User does not exist"

# Confirm kept user has correct data
aws cognito-idp admin-get-user \
  --user-pool-id "$POOL_ID" \
  --profile "$PROFILE" \
  --username <kept_username> | jq '.UserAttributes'
```

## Rollback

**Deleted users cannot be restored.**

For incorrect updates, manually fix attributes:

```bash
aws cognito-idp admin-update-user-attributes \
  --user-pool-id "$POOL_ID" \
  --profile "$PROFILE" \
  --username <username> \
  --user-attributes Name=<attr>,Value=<value>
```
