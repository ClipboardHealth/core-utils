# Configuration

```text
Contains secrets?
  └── Yes → SSM Parameter Store
  └── No → Engineers-only, tolerate 1hr propagation?
      └── Yes → Hardcode with @clipboard-health/config (Zod schemas)
      └── No → 1:1 with DB entity OR needs custom UI?
          └── Yes → Database
          └── No → LaunchDarkly feature flag (@clipboard-health/feature-flags + Zod)
```

**Choose database storage when:** config has a 1:1 relationship with a DB entity, is used in queries, needs a custom UI, is vendor-pushed, needs Snowflake/Metabase/Hex propagation, or risks exceeding LaunchDarkly rate limits.

**NPM package management**: Use exact versions: add `save-exact=true` to `.npmrc`

## Secrets

- `.env` locally (gitignored)
- Production: AWS SSM Parameter Store
- Prefer short-lived tokens
- Never hardcode secrets or credentials in source code; never commit secrets to Git

**Naming:** `[ENV]_[VENDOR]_[TYPE]_usedBy_[CLIENT]_[SCOPE]_[CREATED_AT]_[OWNER]`

## Third-Party Dependencies

- Verify any new package has a commercially compatible license (MIT and Apache are acceptable; GPL is not)
- Do not add a dependency if equivalent functionality already exists in an installed package or `@clipboard-health/*` library
- Document dependency evaluation in the PR: popularity, maintenance cadence, security history, and (for frontend) bundle size and code-splitting impact
