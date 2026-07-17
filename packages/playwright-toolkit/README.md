# `@clipboard-health/playwright-toolkit`

Shared anti-flake primitives for Clipboard Health Playwright suites.

The package owns retry policy, APM correlation, shared admin-token caching, deployed-asset checks, Mailpit polling, Cognito login diagnostics, and setup retry classification. Consuming repositories keep only configuration and domain-specific matching.

## Install

```bash
npm install --save-dev @clipboard-health/playwright-toolkit
```

`@playwright/test` is a peer dependency. The package supports Playwright 1.50 and newer.

## API map

| Local capability                        | Package replacement                                                                      |
| --------------------------------------- | ---------------------------------------------------------------------------------------- |
| `retryWithBail`                         | `runWithRetry({ mode: { kind: "classified", ... } })`                                    |
| `retryUntilPassOrTimeout`               | `runWithRetry({ mode: { kind: "poll", ... } })`                                          |
| Copy-pasted traceparent page fixture    | `createTraceparentFixtures()`                                                            |
| Admin token promise cache and file lock | `generateAdminAuthToken()` or `getOrCreateAdminAuthToken()`                              |
| Deployed frontend/mobile asset loops    | `verifyDeployedAssets()` and `waitForDeployedAssets()`                                   |
| Mailpit search/fetch loops              | `createMailpitClient()`, `fetchMagicLinkFromMailpit()`, `fetchEmailOtpCodeFromMailpit()` |
| Cognito OTP redirect debugging          | `fillOtpAndWaitForCognitoRedirect()`                                                     |
| Setup HTTP and identity retry checks    | `classifySetupRetry()` and `isRetryableHttpStatus()`                                     |

## Retry contract

`runWithRetry` is the only retry abstraction in this package. It has two modes because retries and polling answer different questions.

### Classified retry

Use classified retry for an operation that should normally pass on the first attempt. The caller must provide `isTransient`. There is no default that retries arbitrary failures.

```typescript
import { runWithRetry } from "@clipboard-health/playwright-toolkit";

const result = await runWithRetry({
  operationName: "create shift offer",
  operation: async () => await createShiftOffer(),
  mode: {
    kind: "classified",
    maxAttempts: 4,
    delayMs: 2000,
    isTransient: ({ error }) => isKnownCdcReadinessError(error),
  },
});

const shiftOffer = result.value;
```

A legal classified retry satisfies the flaky-critic B1 contract:

- The operation is safe to repeat.
- `isTransient` positively identifies a known transient condition.
- Validation, permission, and other deterministic failures return `false`.
- The retry has a fixed attempt budget.
- Exhaustion throws `RetryError` with the attempt count, elapsed time, terminal reason, and last cause.

Do not use a broad status such as every `422` as the predicate. Match the specific readiness message or service condition that can resolve without changing the request.

### Poll until pass

Use poll mode for an idempotent readiness probe where failure means "not ready yet."

```typescript
const result = await runWithRetry({
  operationName: "wait for worker profile",
  operation: async () => await assertWorkerProfileReady(),
  mode: {
    kind: "poll",
    timeoutMs: 90_000,
    intervalsMs: [1000, 2000, 3000, 5000],
  },
});
```

Set `mode.isTransient` when the probe can also throw deterministic failures. Returning `false` stops immediately with `reason: "non-transient"`.

Poll mode races each attempt against the remaining timeout budget and aborts the attempt's `signal` when the deadline expires. Pass that signal to network calls so timed-out work is cancelled:

```typescript
operation: async ({ signal }) =>
  await fetch(readinessUrl, {
    signal,
  });
```

## Per-test traceparent fixture

Extend the repository's existing Playwright test object once:

```typescript
import { test as base } from "@playwright/test";
import {
  createTraceparentFixtures,
  type TraceparentFixtures,
} from "@clipboard-health/playwright-toolkit";

export const test = base.extend<TraceparentFixtures>(createTraceparentFixtures());
```

The auto fixture creates one non-zero W3C `traceparent`, preserves project-level `extraHTTPHeaders`, installs the merged headers on the browser context before the test body runs, and adds a `traceparent` test annotation. Pass existing headers to `installTraceparentForTest` if a custom fixture installs the header manually.

## Admin tokens

`generateAdminAuthToken` runs `cbh auth gentoken user`, retries only approved transient CLI signatures, redacts the admin email from errors, and caches the bearer token behind an atomic filesystem lock.

```typescript
const tokenEntry = await generateAdminAuthToken({
  adminEmail: adminUser.email,
  apiEnvironmentName: "staging",
  cacheIdentity: {
    namespace: "cbh-admin-frontend",
    clientName: "admin-app",
    issuer: "clipboard-health-staging",
    tokenKind: "access",
  },
  clientName: "admin-app",
  cacheDurationMs: 10 * 60 * 1000,
  validateToken: async ({ authToken }) => {
    const response = await fetch(`${adminApiUrl}/auth/session`, {
      headers: { Authorization: authToken },
    });

    if (response.status === 401 || response.status === 403) {
      return false;
    }

    if (!response.ok) {
      throw new Error(`Admin token validation failed with HTTP ${response.status}`);
    }

    return true;
  },
});

const adminAuthToken = tokenEntry.authToken;
```

The cache key contains the environment, a SHA-256 digest of the email, and the optional explicit cache identity; it never contains the email itself. Give each repository a stable `namespace`, and distinguish credentials by token kind, client, audience, and issuer when those values differ. `generateAdminAuthToken` automatically distinguishes different `clientName` values even when `cacheIdentity` is omitted.

JWT cache freshness is bounded to the earlier of `cacheDurationMs` and the token's `exp` claim minus a 60-second safety skew. Opaque bearer tokens continue to use `cacheDurationMs`. Set `jwtExpirationSafetySkewMs` when a suite needs a different skew.

When `validateToken` is provided, the toolkit runs the read-only probe while holding the cache lock and records successful validation in the cache entry, so waiting Playwright workers share one probe. Return `false` only when the consumer rejects the credential, such as HTTP `401` or `403`; throw for timeouts, `5xx` responses, and other validation infrastructure failures. A rejected cached token is evicted and replaced once for all waiting workers and shards. A rejected generated token is not cached. The probe should verify the same audience and permission boundary the suite needs without mutating application state.

The cache and lock files use mode `0600`. A process that acquires the lock re-reads the cache before generating, which prevents duplicate token mints across Playwright workers, shards, and local processes.

Use `getOrCreateAdminAuthToken` when the repository needs a different token command:

```typescript
const tokenEntry = await getOrCreateAdminAuthToken({
  adminEmail,
  apiEnvironmentName,
  cacheIdentity: {
    namespace: "cbh-mobile-app",
    audience: "monolith-api",
    clientName: "mobile-app",
    tokenKind: "access",
  },
  cacheDurationMs: 10 * 60 * 1000,
  createToken: async () => await generateTokenWithRepositoryCli(),
});
```

Use `forceRefresh: true` for a one-time recovery after a consumer rejects a token, or invalidate it explicitly:

```typescript
import {
  getOrCreateAdminAuthToken,
  invalidateAdminAuthToken,
} from "@clipboard-health/playwright-toolkit";

await invalidateAdminAuthToken({
  adminEmail,
  apiEnvironmentName,
  cacheIdentity,
});

const freshTokenEntry = await getOrCreateAdminAuthToken({
  ...tokenParams,
  forceRefresh: true,
});
```

Only retry a request automatically when it is read-only or otherwise safe to repeat. The toolkit does not replay consumer requests because it cannot determine whether a failed mutation had side effects.

Use `onCacheEvent` for safe diagnostics. Events expose only `kind`, a cache-key fingerprint, and expiration/validation timestamps; they never include the token, email, or raw identity fields.

## Deployed assets

Repository wrappers still discover assets and decide which files are runtime or fingerprinted. The package owns request concurrency, timeouts, cache busting, content-type checks, transient HTTP retries, attempt diagnostics, and stable-window polling.

```typescript
const report = await waitForDeployedAssets({
  checks: localAssetManifest.map((asset) => ({
    path: asset.path,
    url: new URL(asset.path, deploymentBaseUrl).toString(),
    method: asset.isFingerprintNamedJavaScript ? "GET" : "HEAD",
    cacheMode: asset.isRuntimeAsset ? "cache-busted" : "normal",
    expectedContentTypes: [asset.contentType],
  })),
  timeoutMs: 10 * 60 * 1000,
  pollIntervalMs: 10_000,
  stableWindowMs: 30_000,
});
```

HTTP `408`, `425`, `429`, and `5xx` responses are transient for asset delivery. Content-type mismatches and failed custom validators are deterministic unless the validator returns `isTransient: true`.

Use `validateResponse` for repository-specific checks such as `build-info.json` commit matching. The verifier does not consume a successful response body before calling the wrapper, so the callback can read it directly.

## Mailpit

Create a client from repository configuration, then use the typed pollers:

```typescript
const mailpit = createMailpitClient({
  password: process.env.MAILPIT_PASSWORD ?? "",
});

const code = await fetchEmailOtpCodeFromMailpit({
  client: mailpit,
  email,
  sentAfter: codeRequestedAt,
  excludeCodes: [previousCode],
});

await page.getByLabel("Verification Code").fill(code.value);
```

The pollers search newest-first, tolerate incomplete dates in search results, fetch at most three candidates per probe, and retry Mailpit network errors, `404`, `408`, `429`, and `5xx`. They return both the extracted value and source message ID.

## Cognito OTP and login diagnostics

`fillOtpAndWaitForCognitoRedirect` monitors `RespondToAuthChallenge` requests for `SMS_OTP` and `EMAIL_OTP` while it waits for the expected redirect.

```typescript
await fillOtpAndWaitForCognitoRedirect({
  page,
  testInfo,
  otp,
  expectedUrl: /\/dashboard/,
});
```

On failure, the error includes the sanitized Cognito request summary, response or request-failure detail, current URL, and visible page-text sample. When `testInfo` is provided, it attaches a redacted screenshot. `sanitizeCognitoDiagnosticText` and `isCognitoOtpChallengeRequest` are public for repository-specific login flows.

## Setup retry classification

`classifySetupRetry` separates identity collisions from transient infrastructure failures:

```typescript
const classification = classifySetupRetry({
  error,
  isIdentityCollision: ({ error: candidate }) => isWorkerCreationPhoneCollision(candidate),
});
```

The result follows the flaky-critic C1 contract:

| Classification       | Decision              | Identity behavior                                             |
| -------------------- | --------------------- | ------------------------------------------------------------- |
| `identity-collision` | `regenerate-identity` | Generate a fresh phone, email, or ID before the next attempt. |
| `transient`          | `retry-same-identity` | Repeat the same request and identity.                         |
| `deterministic`      | `do-not-retry`        | Fail immediately.                                             |

`isRetryableHttpStatus` returns `true` only for `408`, `429`, and `5xx`. A repository can add a narrow `isTransientError` predicate for a known non-HTTP transient signature.

## Migration checklist

1. Replace the local helper import with the package export.
2. Move repository-specific URLs, selectors, asset discovery, and error-message matching into a thin wrapper.
3. Keep retry classification narrow. Record why the operation is safe to repeat.
4. For identity collisions, generate the identity inside the retry operation so each collision attempt gets a fresh value.
5. Delete the local helper and port its boundary tests to the wrapper.
6. Run the consuming repository's Playwright unit tests and E2E setup checks.
