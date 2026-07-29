# Feature-Flag and Third-Party Bootstrap Nondeterminism

Last reviewed: 2026-07-29.

## Symptom signatures

- `LaunchDarkly initialization failed after N attempts` aborts application or service startup.
- A vendor SDK/API request for feature flags, Stripe, Maps, analytics, or monitoring fails or hangs before expected UI renders.
- A popup/new tab makes real third-party requests even though the original page was mocked.
- CORS errors or default flag values are followed by unauthorized or wrong-route API calls.
- The final test failure is a missing button/locator, but the first divergence is an external bootstrap request.
- A Maps request is aborted, `window.google` remains absent, and mounting a map-backed surface throws through the global application error boundary.

## Mechanism

Application readiness depends on third-party initialization whose availability, page scope, or completion timing is nondeterministic.

There are two important subtypes:

1. A true runtime dependency such as LaunchDarkly may intentionally be hard. Failing open is safe only when every flag has a verified safe default and the client will recover correctly.
2. E2E-only external dependencies should be isolated at the right scope. Page-scoped mocks do not apply to a popup/new tab, and route navigation is not ready merely because the DOM content loaded event fired.

Optional SDK consumers also need a runtime-availability contract. A provider-local error boundary cannot protect a hook that reads the vendor global before that boundary mounts.

## Affected repositories and surfaces

- `clipboard-health`: NestJS feature-flag provider startup.
- `cbh-admin-frontend`: facility onboarding popups, LaunchDarkly/analytics/monitoring/Places dependencies.
- `cbh-mobile-app`: vendor-backed onboarding and post-auth route bootstraps; approximate-location maps and hooks that construct Google Maps objects after an aborted or incomplete SDK bootstrap.
- Any browser test that opens another page or relies on external scripts before rendering route readiness UI.

## What fixed it

- Install E2E mocks on `browserContext.route()` when every page/tab in the context must inherit them.
- Register popup/new-page waits before the click, then wait for a product readiness signal on the new page.
- For vendor bootstraps, wait on an explicit SDK or product readiness signal and report the failed external request.
- Mock third-party behavior when it is not the system under test, while preserving the real contract shape.
- Decide LaunchDarkly degraded behavior explicitly from product safety, not from test convenience.

[cbh-admin-frontend#5989](https://github.com/ClipboardHealth/cbh-admin-frontend/pull/5989) moved feature-flag and third-party mocks to the browser context for popup coverage.

[cbh-mobile-app#12938](https://github.com/ClipboardHealth/cbh-mobile-app/pull/12938) fixed the Maps runtime-availability variant from [STAFF-1861](https://linear.app/clipboardhealth/issue/STAFF-1861). Map-backed hooks now guard construction on runtime availability, the nested error boundary owns the failing surface, and focused tests cover an absent global without replacing the authenticated application.

## What failed and why

- The blanket LaunchDarkly fail-open proposal in [clipboard-health#26748](https://github.com/ClipboardHealth/clipboard-health/pull/26748) was closed. Review established that defaults are not reliably safe and an initialized client might not recover in the intended way, so making LaunchDarkly optional could produce a broader incorrect-state outage.
- Page-scoped `page.route()` mocks passed on the original page but leaked real LaunchDarkly and third-party requests from a newly opened tab.
- Waiting only for navigation or the DOM content loaded event treated the HTML document as application readiness; a vendor SDK or flag bootstrap could still prevent React from rendering.
- Longer locator timeouts hid the external request that failed and provided no bootstrap diagnostics.
- Mocking away the third party is wrong when that integration is the behavior under test; use contract-faithful mocks only for dependencies outside the scenario.
- A provider-level Maps fallback was partial because `useMapRadiusCircle` read `google.maps` above the nested boundary. The local provider recovered, but opening the visit sheet still let the missing global escape to the app-wide boundary.
- Do not classify every Stripe- or Maps-named test as this mechanism. [STAFF-1486](https://linear.app/clipboardhealth/issue/STAFF-1486) and [cbh-mobile-app#12309](https://github.com/ClipboardHealth/cbh-mobile-app/pull/12309) were static-asset `503` failures on a Stripe route, so they belong to the lazy-chunk/CDN entries.

## Current status

Mixed by dependency. Browser-context mock scope, explicit vendor readiness signals, and guarded optional-SDK consumers are the established patterns. The known mobile Maps missing-global path is covered by [cbh-mobile-app#12938](https://github.com/ClipboardHealth/cbh-mobile-app/pull/12938). LaunchDarkly remains an intentional hard dependency in backend-main until safe defaults and recovery semantics are proven; do not cite this KB entry as permission to swallow its initialization errors.

## Evidence

- [cbh-admin-frontend#5989](https://github.com/ClipboardHealth/cbh-admin-frontend/pull/5989): popup failure caused by page-scoped LaunchDarkly/third-party mocks.
- [clipboard-health#26748](https://github.com/ClipboardHealth/clipboard-health/pull/26748): rejected LaunchDarkly fail-open attempt and reviewer rationale.
- [STAFF-1861](https://linear.app/clipboardhealth/issue/STAFF-1861): aborted Maps bootstrap, missing-global trace, and boundary-ownership diagnosis.
- [cbh-mobile-app#12938](https://github.com/ClipboardHealth/cbh-mobile-app/pull/12938): runtime guard, boundary ownership, and missing-global regression coverage.
