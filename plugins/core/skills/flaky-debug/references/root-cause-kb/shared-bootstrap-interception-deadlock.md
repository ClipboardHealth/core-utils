# Shared-Bootstrap Interception Deadlock

Last reviewed: 2026-07-29.

## Symptom signatures

- A Playwright fault injection withholds a shared bootstrap response, then waits for feature UI that never appears.
- The same endpoint is consumed by session or provider bootstrap and by the dependency the test intends to delay.
- Removing the response hold lets the schedule, navigation, or target interaction render normally.

## Mechanism

The test intercepts a shared bootstrap endpoint and delays one response to exercise a later provider transition. Before releasing it, the test waits for feature UI whose authenticated layout depends on the same deduplicated query. The response release waits for the UI, while the UI waits for the held response, creating a deterministic dependency cycle.

This is test-controlled orchestration, not slow product bootstrap. The application cannot make progress while Playwright deliberately owns the response release.

## Affected repositories and surfaces

- `cbh-admin-frontend`: rate-negotiation fault injection around the shared `/api/facilityUser/findByEmail` query.
- Browser tests that hold a shared bootstrap or session response until downstream UI becomes ready.

## What fixed it

- Remove a fault injection when it cannot isolate the intended dependency from prerequisite bootstrap consumers.
- Keep coverage for the durable product behavior—stable provider composition and one mutation request—in focused component and E2E assertions that do not introduce a dependency cycle.
- When a response hold is necessary, release it from an independent signal that does not consume the same query.

[cbh-admin-frontend#7674](https://github.com/ClipboardHealth/cbh-admin-frontend/pull/7674) removed the second-current-user-response hold and its deferred release from the rate-negotiation E2E while retaining the product interaction and single-request assertion.

## What failed and why

- Holding only the second current-user request still blocked all consumers deduplicated onto that shared query.
- Waiting for `Unfilled` before releasing the current-user response formed the cycle because the schedule UI required the authenticated bootstrap to finish.
- Increasing the locator timeout could not resolve a response that the test had not released.
- Treating the failure as a generic provider remount obscured that the product-side stable-composition fix had already landed; the remaining deadlock existed in the test orchestration.

## Current status

Fixed for the rate-negotiation fault injection in [STAFF-1900](https://linear.app/clipboardhealth/issue/STAFF-1900). Future cases require proof that the held response is a prerequisite of the release signal; ordinary slow bootstrap belongs to its underlying service or provider mechanism.

## Evidence

- [STAFF-1900](https://linear.app/clipboardhealth/issue/STAFF-1900): deadlock timeline and verification against current test and provider source.
- [cbh-admin-frontend#7674](https://github.com/ClipboardHealth/cbh-admin-frontend/pull/7674): deletion of the shared-response hold and preservation of the end-negotiation regression.
