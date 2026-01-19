# Security

**Secrets:**

- `.env` locally (gitignored)
- Production: AWS SSM Parameter Store
- Prefer short-lived tokens

**Naming:** `[ENV]_[VENDOR]_[TYPE]_usedBy_[CLIENT]_[SCOPE]_[CREATED_AT]_[OWNER]`
