# Cognito API Throttling Under Parallel Setup Load

Last reviewed: 2026-07-16.

## Symptom signatures

- `TooManyRequestsException` from `AdminUpdateUserAttributes`, `MakeTestToken`, login, or token-mint setup.
- `MAKE_TEST_TOKEN: Too many requests`.
- HCF or auth setup produces clustered `401`/`403` failures across shards while unrelated UI assertions never run.
- Failures correlate with worker/shard fan-out and pass on retry after the burst subsides.

## Mechanism

Parallel Playwright workers and overlapping CI runs share one staging Cognito pool and API quota. Stateful writes or token creation placed on per-test/per-token hot paths multiply across workers. In-process caches do not coordinate separate Node processes, so each worker independently repeats the same setup work.

Retries that do not reduce concurrency or call volume amplify the burst. The terminal cause is shared-capacity pressure, not the individual test that happened to request a token when the quota was exhausted.

## Affected repositories and surfaces

- `cbh-admin-frontend`: Playwright global setup, token minting, shared admin user types, dynamic worker/HCF setup.
- `cbh-mobile-app`: shared credential acquisition and admin-auth token caches.
- Any parallel test harness using the same Cognito pool or backend token endpoint without cross-process coordination.

## What fixed it

- Remove stateful Cognito writes from per-token paths and provision invariants at creation/global-setup boundaries.
- Deduplicate remaining writes by identity and requested attributes.
- Serialize or cap Cognito Admin/token operations across processes, not only within one worker.
- Cache shared tokens with a conservative TTL.
- Cap Playwright worker fan-out when the shared environment cannot support the theoretical concurrency.
- Preserve structured status/body/request IDs so a throttle is not misdiagnosed as an auth or UI failure.

[cbh-admin-frontend#6697](https://github.com/ClipboardHealth/cbh-admin-frontend/pull/6697) removed per-token user-type writes; [cbh-admin-frontend#6731](https://github.com/ClipboardHealth/cbh-admin-frontend/pull/6731) added cross-process slots, token caching, diagnostics, and a worker cap.

## What failed and why

- Frontend waits and Playwright retries did not change Cognito call volume. Repeating setup could create more token and attribute operations and worsen the throttle.
- Per-process throttles/caches were insufficient because each Playwright worker is a separate process.
- Retrying every auth/setup failure without classification hid real `401`/`403` contract errors and still amplified rate-limited operations.
- Treating the Upcoming Charges test as the owner was a failure-surface mistake: the observed error occurred in shared auth setup before the page loaded.

## Current status

Mitigated for the known admin staging setup paths. Cross-process coordination and removal of hot-path writes are the reusable fix class. Re-open the capacity question only after measuring call volume with these controls; quota increases or a dedicated E2E pool are secondary options, not the first fix.

## Evidence

- [STAFF-1122](https://linear.app/clipboardhealth/issue/STAFF-1122): canonical investigation; CloudTrail evidence included 980 throttled `AdminUpdateUserAttributes` calls.
- [cbh-admin-frontend#6697](https://github.com/ClipboardHealth/cbh-admin-frontend/pull/6697): removed per-token Cognito writes and deduplicated remaining setup mutations.
- [STAFF-1169](https://linear.app/clipboardhealth/issue/STAFF-1169): follow-up for broader staging auth fan-out.
- [cbh-admin-frontend#6731](https://github.com/ClipboardHealth/cbh-admin-frontend/pull/6731): shared cross-process throttling, caching, worker cap, and diagnostics.
