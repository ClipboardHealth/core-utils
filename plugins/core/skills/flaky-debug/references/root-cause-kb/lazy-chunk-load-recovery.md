# Lazy-Chunk Load Failures Need Product-Side Recovery

Last reviewed: 2026-07-16.

## Symptom signatures

- `ChunkLoadError`.
- `Failed to fetch dynamically imported module`.
- A JavaScript asset request returns `5xx`, then a lazy route never renders.
- Playwright times out on a page locator even though the earliest failure is a static chunk request.
- Multiple routes/tests fail with different selectors during the same asset incident.

## Mechanism

A transient static-asset failure rejects a dynamic import. The lazy loader or route remains stuck behind the rejected import/error boundary even after the origin recovers. Downstream locator failures are secondary because the route's code never loaded.

The recovery belongs in the shared product loader: classify chunk-load failures and perform one guarded reload for the affected app version, commit, page, and session. The test may add diagnostics, but it should not be the only recovery layer.

## Affected repositories and surfaces

- `cbh-admin-frontend`: React lazy routes through the central `loadLazily` wrapper.
- `cbh-mobile-app`: Playwright route-bootstrap and static-asset recovery helpers; these protect tests, not real users.
- Any deployed SPA using content-hashed chunks that may briefly fail during deploy/origin/CDN incidents.

## What fixed it

- Centralize recognition of browser chunk-load/dynamic-import failures.
- Retry the import as appropriate, then reload at most once using a session guard scoped to app version, commit, and route.
- Fall through to the normal error boundary after the bounded recovery is exhausted.
- Log whether recovery was attempted, skipped by the guard, or exhausted.

[cbh-admin-frontend#5650](https://github.com/ClipboardHealth/cbh-admin-frontend/pull/5650) is the canonical product fix. Mobile later added Playwright-only static-asset route-bootstrap armor in [cbh-mobile-app#11958](https://github.com/ClipboardHealth/cbh-mobile-app/pull/11958) and reused it on the Stripe-named asset failure in [cbh-mobile-app#12309](https://github.com/ClipboardHealth/cbh-mobile-app/pull/12309).

## What failed and why

- Five sibling PRs ([#5645](https://github.com/ClipboardHealth/cbh-admin-frontend/pull/5645), [#5646](https://github.com/ClipboardHealth/cbh-admin-frontend/pull/5646), [#5647](https://github.com/ClipboardHealth/cbh-admin-frontend/pull/5647), [#5648](https://github.com/ClipboardHealth/cbh-admin-frontend/pull/5648), and [#5649](https://github.com/ClipboardHealth/cbh-admin-frontend/pull/5649)) treated individual routes/tests as separate fixes. They were consolidated because the mechanism was shared.
- Per-test route-ready retries and chunk monitors can improve diagnostics but leave real users stuck when the lazy loader itself has no recovery.
- Unbounded reloads can create a loop during a persistent deploy or asset mismatch. Recovery must be one-time and version/route scoped.
- Loader recovery alone could not defeat a CDN that cached the same `503` for every retry; that is the separate [CDN amplification mechanism](./cdn-503-amplification.md).

## Current status

Product-side recovery is merged for the known admin loader. Mobile's cited recovery is test-harness-only, so a real-user mobile web failure still needs a product-side loader diagnosis. Future per-route sightings should first verify whether the surface has product recovery, harness armor, or neither, and whether the asset failure is transient. Do not create one implementation per test.

## Evidence

- [cbh-admin-frontend#5645](https://github.com/ClipboardHealth/cbh-admin-frontend/pull/5645): representative closed per-surface attempt that mixed product and E2E recovery.
- [cbh-admin-frontend#5650](https://github.com/ClipboardHealth/cbh-admin-frontend/pull/5650): merged centralized lazy-chunk recovery.
- [cbh-admin-frontend#5492](https://github.com/ClipboardHealth/cbh-admin-frontend/pull/5492): earlier chunk-load logging and user-facing refresh behavior.
- [cbh-mobile-app#11958](https://github.com/ClipboardHealth/cbh-mobile-app/pull/11958): Playwright app-bootstrap static-asset retry helper.
- [cbh-mobile-app#12309](https://github.com/ClipboardHealth/cbh-mobile-app/pull/12309): Stripe-route sighting whose actual cause was CloudFront/static assets, not Stripe bootstrap.
