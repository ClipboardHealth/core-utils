# Fix Workflow

Execute fixes after reviewing `analysis.csv`.

## Always Dry-Run First

```bash
cognito-fix-duplicates.sh analysis.csv --dry-run
```

Review output to confirm correct users will be deleted/updated.

## Execute

```bash
cognito-fix-duplicates.sh analysis.csv
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
# Confirm deleted user is gone
aws cognito-idp admin-get-user \
  --user-pool-id us-west-2_in7ey5PCw \
  --profile cbh-production-platform \
  --username <deleted_username>
# Should return: "User does not exist"

# Confirm kept user has correct data
aws cognito-idp admin-get-user \
  --user-pool-id us-west-2_in7ey5PCw \
  --profile cbh-production-platform \
  --username <kept_username> | jq '.UserAttributes'
```

## Rollback

**Deleted users cannot be restored.**

For incorrect updates, manually fix attributes:

```bash
aws cognito-idp admin-update-user-attributes \
  --user-pool-id us-west-2_in7ey5PCw \
  --profile cbh-production-platform \
  --username <username> \
  --user-attributes Name=<attr>,Value=<value>
```
