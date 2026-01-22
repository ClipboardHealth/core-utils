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
