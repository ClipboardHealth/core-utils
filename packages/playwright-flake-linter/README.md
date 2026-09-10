# @clipboard-health/playwright-flake-linter

Shared, configurable TypeScript AST checks for Playwright flake anti-patterns.
The rule implementation lives in this package; consuming repositories provide
only their paths, helper names, mechanism names, and justified exceptions.

## Install

```bash
npm install --save-dev @clipboard-health/playwright-flake-linter
```

TypeScript is a runtime dependency because the checker uses the compiler API;
`glob` provides the repository-standard source discovery used by `embedex`.
Both are actively maintained, commercially compatible (Apache-2.0 and ISC),
already standardized in this monorepo, and the CLI is not included in
application bundles.

## Configure

Create `playwright-flake-lint.config.mjs` at the repository root:

```javascript
export default {
  scanRoots: ["playwright"],
  hardenedIdentityHelperNames: ["generateRandomUserEmail"],
  identityHelperMinimumLengths: {
    generateRandomAlphaNumericString: 24,
    generateRandomString: 26,
  },
  retryHelperNames: ["retry"],
  specificRequestMatcherNames: ["isMatchingRequest"],
  transientClassifierNamePatterns: ["^isRetryable", "retryClassification"],
  undiscriminatingRetryHelperNames: ["retryUntilPassOrTimeout", "toPass"],
  sharedReadinessMechanisms: [
    {
      name: "Home Health response readiness",
      filePathPattern: "playwright/e2e/homeHealth/.*\\.spec\\.ts$",
      directCallNames: ["waitForResponse"],
      sharedHelperNames: ["waitForHomeHealthResponse"],
    },
  ],
};
```

The mobile repository can use its own genuine names without changing a rule:

```javascript
export default {
  scanRoots: ["playwright"],
  identityHelperMinimumLengths: {
    mobileRandomSuffix: 32,
  },
  retryHelperNames: ["retryMobileAction"],
  specificRequestMatcherNames: ["matchesMobileRequest"],
  transientClassifierNamePatterns: ["^isTransientMobile"],
  sharedReadinessMechanisms: [
    {
      name: "BottomSheet readiness",
      filePathPattern: "playwright/e2e/sheets/.*\\.spec\\.ts$",
      directCallNames: ["waitForResponse"],
      sharedHelperNames: ["waitForBottomSheet"],
    },
  ],
};
```

All pattern fields are JavaScript regular-expression source strings. Optional
configuration:

| Field                              | Purpose                                                             |
| ---------------------------------- | ------------------------------------------------------------------- |
| `allowlist`                        | Reason-required repository exceptions by rule and file pattern      |
| `hardenedIdentityHelperNames`      | Identity helpers that are safe without a length argument            |
| `identityHelperMinimumLengths`     | Repository random-helper names and their safe minimum lengths       |
| `identityNamePattern`              | Names treated as parallel-worker-sensitive identities               |
| `responseWaitCallNames`            | Repository response-wait utility names                              |
| `retryHelperNames`                 | Retry utilities whose callbacks must classify transient failures    |
| `sharedReadinessMechanisms`        | File/mechanism registry mapping direct gates to shared helpers      |
| `specificRequestMatcherNames`      | Delegated helpers that fully discriminate a response request        |
| `specFilePattern`                  | Files where fixed-sleep checks apply                                |
| `transientClassifierNamePatterns`  | Classifier names accepted inside retry callbacks                    |
| `undiscriminatingRetryHelperNames` | Utilities that inherently retry any failure and are always rejected |

`sharedReadinessMechanisms[].name` is the diagnostic label, so repositories can
use their native terminology such as `Dialog` or `BottomSheet`.

## Wire into CI

Add the executable to the repository's existing verification chain:

```json
{
  "scripts": {
    "architecture:check": "existing-checks && playwright-flake-lint"
  }
}
```

Use a non-default config location with
`playwright-flake-lint --config path/to/config.mjs`.

## Rules

| Rule ID                | Anti-pattern                                                     | Required alternative                                                 |
| ---------------------- | ---------------------------------------------------------------- | -------------------------------------------------------------------- |
| `fixed-sleep`          | `waitForTimeout` or `setTimeout` delays in specs                 | Rubric B2: use a deterministic readiness signal                      |
| `response-wait`        | Status/`.ok()` response predicates without specific request data | Rubric B2: match method, URL, and a discriminating request predicate |
| `retry-classification` | Retry utilities invoked without transient-only classification    | Rubric B1: classify transient failures and fail fast otherwise       |
| `test-data-identity`   | Low-entropy identities or bypasses of hardened random helpers    | Rubric A2: use configured hardened or UUID-backed identities         |
| `shared-readiness`     | Per-spec readiness gates where a shared mechanism helper exists  | Rubric A1: use or extend the configured shared helper                |

## Allowlisting

Prefer fixing a violation. A justified inline exception must immediately
precede the violating statement and include a reason:

```typescript
// flake-lint-allow fixed-sleep -- The timer fixture verifies elapsed product time.
await page.waitForTimeout(100);
```

A repository-level exception also requires a reason:

```javascript
export default {
  scanRoots: ["playwright"],
  allowlist: [
    {
      ruleId: "fixed-sleep",
      filePathPattern: "playwright/e2e/legacy/timer\\.spec\\.ts$",
      reason: "The timer fixture verifies elapsed product time.",
    },
  ],
};
```

Comments or config entries without a non-empty reason do not suppress a
violation.

## Future shared rules

The existing per-repository Dialog/query-list checks are a candidate for this
package. Their component-name difference (`Dialog` in admin and `BottomSheet`
in mobile) belongs in repository config when that rule is migrated; this
package does not change those checks yet.
