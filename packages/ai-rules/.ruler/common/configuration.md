# Configuration

```text
Contains secrets?
  └── Yes → SSM Parameter Store
  └── No → Engineers-only, tolerate 1hr propagation?
      └── Yes → Hardcode with @clipboard-health/config
      └── No → 1:1 with DB entity OR needs custom UI?
          └── Yes → Database
          └── No → LaunchDarkly feature flag
```

**NPM package management**: Use exact versions: add `save-exact=true` to `.npmrc`

## Secrets

- `.env` locally (gitignored)
- Production: AWS SSM Parameter Store
- Prefer short-lived tokens

**Naming:** `[ENV]_[VENDOR]_[TYPE]_usedBy_[CLIENT]_[SCOPE]_[CREATED_AT]_[OWNER]`
