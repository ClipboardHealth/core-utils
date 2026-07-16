# Historical plan snapshot

## Groundcrew

Repository: [mobile frontend]
Implementation workflow: implement this ticket using the `cb-work` skill. If `cb-work` is unavailable, use the `core:go` skill.

## Context

Implementation ticket created from burst investigation `[ticket redacted]`.

Run: [[external evidence reference]]([external evidence reference])
Repo: [mobile frontend]
Workflow: run [reference redacted]`/ attempt`1`Branch:`main`Commit:`d0cd1ee0995e857cb2aed4d2a70c904dccef8044`First failure:`2026-06-27T06:35:06Z`Last failure:`2026-06-27T06:35:06Z`
Tests bundled: 4

## Contained Fingerprints

- `efff313a6fc2` — Documents should upload documents — `playwright/e2e/documents/documents.spec.ts:20`
- `f9aa7c56171d` — Login via email link > Cognito should log in via Cognito magic link from email — `playwright/e2e/auth/authByEmail.spec.ts:35`
- `12dc0db8842a` — Shift Block Cancellation should allow cancellation of a booked block — `playwright/e2e/shiftBlocks/cancelBlocks.spec.ts:50`
- `c97ce093be4e` — Shift Bookability should redirect to onboarding payments when agent payments are disabled and agent can onboard to stripe — `playwright/e2e/shift/shiftBookability.spec.ts:234`

## Investigation Findings

Shared cause identified: all four flakes failed before their product test bodies while the shared Playwright `page` fixture loaded `/v2/e2e-test/loading`. The browser received sustained staging `.js` responses from CloudFront with HTTP `503` and `x-cache: LimitExceeded from cloudfront`, so React never mounted and `getByText("Hang in there!")` never became visible.

Runner-level check: not a single-runner failure. Shards ran on distinct self-hosted runners and completed their jobs successfully:

- `e2e-playwright-1`: `cbh-16-cores_i-0e438393bf84b533b`
- `e2e-playwright-2`: `cbh-16-cores_i-0043fa03fe51d6c6e`
- `e2e-playwright-3`: `cbh-16-cores_i-0409bc9fd01775a33`
- `e2e-playwright-4`: `cbh-16-cores_i-0f8a8d240a52a828f`

Time correlation: the failing attempts saw first staging script failures within a tight window, `2026-06-27T06:35:08.430Z` through `2026-06-27T06:35:08.536Z`. The last observed script failures were `2026-06-27T06:36:05.879Z` through `2026-06-27T06:36:06.095Z`.

Shared dependency: all regular E2E tests use `playwright/setup/global.ts`, which mocks required services and then calls `bootstrapAppRouteWithStaticAssetRetries` from `playwright/helpers/staticAssets.ts` for `appPaths.e2eTestLoading`. The four tests surfaced the same shared bootstrap failure, not four independent product-flow failures.

LLM report summary: `16` tests total, `12` passed, `4` flaky, `0` failed. Every contained test failed attempt 1 after about `61s`, then passed on retry in `15-29s`.

Failure details from the report and job logs:

- `Login via email link > Cognito`: helper diagnostics recorded `744` staging script failures; structured report retained `268` HTTP 503 staging `.js` instances.
- `Documents > should upload documents`: `738` staging script failures; retained `251` HTTP 503 staging `.js` instances.
- `Shift Bookability > onboarding payments`: `602` staging script failures; retained `228` HTTP 503 staging `.js` instances.
- `Shift Block Cancellation`: `698` staging script failures; retained `246` HTTP 503 staging `.js` instances.
- Each failed bootstrap attempt issued `983` script requests; each failed test had two bootstrap attempts and `2964` observed network instances in the reporter summary.
- Error headers included CloudFront diagnostics such as `server: CloudFront`, `x-amz-cf-pop: HIO52-P4`, and `x-cache: LimitExceeded from cloudfront`.
- Page diagnostics showed `document.readyState=complete` and body text from the pre-React splash script, consistent with the HTML document loading while JS bundles failed.

Preflight evidence: both the upstream staging asset preflight and shard-local preflights passed before the burst. Example artifacts:

- `staging-mobile-assets-preflight.json`: `failureCount: 0`, `totalCheckedCount: 1218`, stable window `2026-06-27T06:32:20.671Z` to `2026-06-27T06:33:23.895Z`.
- `deployed-mobile-assets-preflight-shard-1.json`: `failureCount: 0`, `totalCheckedCount: 1218`, stable window ended `2026-06-27T06:34:59.254Z`.
- `deployed-mobile-assets-preflight-shard-3.json`: `failureCount: 0`, `totalCheckedCount: 1218`, stable window ended `2026-06-27T06:34:59.254Z`.

Prior related fixes: `[ticket redacted]` and `[ticket redacted]` are already completed and this June 27 recurrence happened after those changes. Current workflow still runs upstream plus shard-local asset preflight, and both passed in this run, so the next fix should address the browser bootstrap/static-asset fanout or CloudFront limit behavior directly. No open GitHub change with label `flaky-test-fix`, no open change matching `e2e-test/loading`, `bootstrapAppRouteWithStaticAssetRetries`, `staticAssets`, `flaky`, or `deflake` was found.

Confidence: 5/5 for the immediate shared failure mechanism. The upstream reason CloudFront emitted `LimitExceeded` is still inferred from headers and timing, so implementation should preserve or improve edge diagnostics.

## Requested Fix

Fix the recurrent staging E2E `/v2/e2e-test/loading` bootstrap failure where concurrent browser bootstraps request hundreds of JS assets and CloudFront returns `503 LimitExceeded`.

Suggested direction:

1. Measure the effective staging E2E bootstrap concurrency: `fullyParallel: true`, four matrix shards, default Playwright worker count on 16-core runners, and the observed `983` script requests per bootstrap attempt.
2. Implement the smallest harness or CI change that prevents simultaneous browser bootstraps from hammering staging static asset delivery. Reasonable options include explicit lower Playwright `--workers` for staging critical E2E, `strategy.max-parallel` or startup jitter for shards, or a deterministic bootstrap gate/throttle. Prefer a measured concurrency/fanout reduction over adding more retries.
3. If a code-side reduction is practical, reduce the number of JS chunks loaded by `/v2/e2e-test/loading`, or add a lighter app-ready route that still verifies the real app bundle can mount before product tests proceed.
4. Keep or extend diagnostics for CloudFront `LimitExceeded`, `scriptRequestCount`, first/last failure times, and response headers. Do not fix this by editing the four product specs; they share the same setup failure.
5. Re-evaluate whether shard-local mobile asset preflight should remain in addition to the upstream staging preflight. This run had upstream plus per-shard preflights and all passed before browser bootstrap still failed.

## Acceptance Criteria

- The fix targets shared bootstrap/static-asset delivery, not the individual product tests.
- Staging E2E startup no longer launches an avoidable burst of simultaneous `/v2/e2e-test/loading` app bootstraps that can request thousands of JS assets at once.
- CI artifacts or logs make the chosen concurrency/fanout behavior visible enough to verify on future runs.
- Existing CloudFront/script failure diagnostics remain at least as informative as they are now.
- Verification covers changed workflow, Playwright config, helper, or deploy-verifier files as applicable.

## Required change / Commit Instructions

- Include this implementation ticket ID in the change body.
- Include the contained fingerprints in the change or commit context: `efff313a6fc2`, `f9aa7c56171d`, `12dc0db8842a`, `c97ce093be4e`.
- Implement this ticket using the `cb-work` skill or, if unavailable, the `core:go` skill.
