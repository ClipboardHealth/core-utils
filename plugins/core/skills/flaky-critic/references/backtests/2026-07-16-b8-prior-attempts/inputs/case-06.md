# Historical plan snapshot

## Source investigation

Created from [ticket redacted].

## Flake details

```json
{
  "repo": "[mobile frontend]",
  "test": "Timekeeping should be able to clock in and out for a shift",
  "file": "playwright/e2e/shift/timekeeping.spec.ts:627",
  "framework": "playwright",
  "isNewFlaky": false,
  "failures": [
    {
      "error": "Error: expect(locator).toBeVisible() failed\n\nLocator: getByRole('heading', { name: 'Bookings', exact: true })\nExpected: visible\nTimeout: 30000ms\nError: element(s) not found\n\nCall log:\n  - Expect \"toBeVisible\" with timeout 30000ms\n  - waiting for getByRole('heading', { name: 'Bookings', exact: true })\n",
      "stack": "Error: expect(locator).toBeVisible() failed\n\nLocator: getByRole('heading', { name: 'Bookings', exact: true })\nExpected: visible\nTimeout: 30000ms\nError: element(s) not found\n\nCall log:\n  - Expect \"toBeVisible\" with timeout 30000ms\n  - waiting for getByRole('heading', { name: 'Bookings', exact: true })\n\n    at /home/runner/work/[mobile frontend]/[mobile frontend]/playwright/e2e/shift/timekeeping.spec.ts:638:80\n    at WorkerMain._runTest (/home/runner/work/[mobile frontend]/[mobile frontend]/node_modules/dd-trace/packages/datadog-instrumentations/src/playwright.js:1692:5)",
      "branch": "gh-readonly-queue/main/change-[reference redacted]-ef0a31973a7d405b4a94d2e4be21f3e74289b490",
      "pipeline": "[external evidence reference]",
      "commit": "c353f2b925c99717b95cf9dd5afe4656750a8f4e",
      "durationMs": 88060,
      "shard": "3/4",
      "timestamp": "2026-07-06T16:36:30Z"
    }
  ]
}
```

## Plan output

**Test ID:** `7bc4bfd31136`; `playwright/e2e/shift/timekeeping.spec.ts:627`, `Timekeeping > should be able to clock in and out for a shift`

**Confidence:** 4/5. The CI report directly shows the app-level crash screen and the `@react-google-maps/api` invariant before the Bookings assertion fails. The remaining inference is that a provider-local fallback or deterministic Maps mock fully removes the CI race across all affected routes.

**Failure surface:** App bootstrap / product render, with a third-party SDK test-harness contributor. The Bookings locator failure is downstream of the app-wide error boundary.

**Current main status:** The relevant code path still exists on current `origin/main` after refresh. `src/app/app.tsx` still wraps the whole app in `GoogleMapsSdkProvider` and `GoogleMapProvider`; `src/appV2/lib/GoogleMaps/context.ts` still calls `useLoadScript` directly. No open `flaky-test-fix` change matched `timekeeping.spec.ts`/this test. Recent `[ticket redacted]` / change [reference redacted] touched shift readiness helpers, not the Google Maps provider or this timekeeping test.

**Symptom:** After `initializeAndLogin` and `page.goto(appPaths.myShiftsV2)`, `await expect(page.getByRole("heading", { name: "Bookings", exact: true })).toBeVisible()` timed out. The failure screenshot showed the generic app crash page: “Oops! Something went wrong.” with `Restart App` and `Contact Support` actions.

**Root cause:** The app loads the Google Maps JavaScript SDK globally for every route through `GoogleMapsSdkProvider`, even routes like My Shifts that do not need map UI. In the failed attempt, `@react-google-maps/api` marked the script as loaded while `window.google` was absent and threw: `useLoadScript was marked as loaded, but window.google is not present. Something went wrong.` Because this provider sits under the top-level app `ErrorBoundary`, the whole app rendered the generic crash screen, so the Bookings heading never appeared.

**Evidence:**

- LLM report from GitHub Actions run [reference redacted]`, shard `3/4`: one flaky test, first attempt failed in 87.4s, retry passed in 42.5s.
- Failed attempt timeline: `Navigate to "/home-v2/myShifts"` at ~46,020ms, `GET [external evidence reference] returned 200 at ~46,661ms, then console error at ~54,891ms: `Invariant Violation: useLoadScript was marked as loaded, but window.google is not present.`
- Failed attempt network/lifecycle artifact: `GET [external evidence reference] appeared around ~46,491ms with status `-1`, followed by many aborted app requests and then the invariant. This points to a Google Maps SDK loader failure during app bootstrap/render, not a backend My Shifts response mismatch.
- Screenshot artifact: generic `Oops! Something went wrong.` error boundary page at assertion failure.
- Passing retry timeline: Bookings heading visible at ~23,098ms, then the test completed the clock-in, clock-out, timesheet submission, and post-timesheet review flow.
- Code path: `src/app/app.tsx` wraps all routes with `GoogleMapsSdkProvider`; `src/appV2/lib/GoogleMaps/context.ts` calls `useLoadScript`; `node_modules/react-google-maps/api/src/useLoadScript.tsx` throws the exact invariant when `isLoaded` is true but `window.google` is missing.

**Proposed fix:** Product fix first, with a small test-harness hardening if needed.

1. Refactor `src/appV2/lib/GoogleMaps/context.ts` so Google Maps SDK loader failures degrade to `{ isSdkLoaded: false, sdkLoadError }` instead of escaping to the app-wide `ErrorBoundary`.
   - Preserve the exported `GoogleMapsSdkProvider` and `useGoogleMapsSdkContext` API so `src/app/context/googleMapContext.tsx` and map components do not need broad changes.
   - A practical shape is an explicit React context plus an inner loader component that calls `useLoadScript`, wrapped by a provider-local `react-error-boundary` fallback. The fallback should provide the same context value with `isSdkLoaded: false` and a normalized `sdkLoadError`, then still render children.
   - Log the provider-level loader/invariant failure through `APP_V2_APP_EVENTS.GOOGLE_MAPS_SDK_LOAD_ERROR` with error metadata. Do not log the API key.
   - Keep actual map surfaces protected by their existing `GoogleMapErrorBoundary` so map UI can show map-specific fallback copy while non-map routes continue working.
2. Add a focused Vitest test under `src/appV2/lib/GoogleMaps/` proving that when the Maps loader throws, descendants still render and `useGoogleMapsSdkContext()` reports an unloaded/error state instead of crashing the app.
3. If the targeted Playwright run still contacts external Google Maps or remains flaky after the provider fix, add a central Playwright mock in `playwright/mocks` and call it from `playwright/setup/global.ts` before `bootstrapAppRouteWithStaticAssetRetries`. The mock should fulfill `[external evidence reference] with a minimal SDK stub that defines the namespaces used by app bootstrap and invokes the configured callback, avoiding third-party script races in E2E.

**Observability to reach 5/5:** Add provider-level logging for loader invariant failures with route/path, script `data-state`, whether `window.google` and `window.google.maps` exist, and the sanitized SDK URL shape/version/libraries. This would distinguish CDN/network/script races from application code removing the global.

**Sibling candidates:** This is provider-wide. Any E2E test that boots the app can hit it, especially tests that navigate to `appPaths.myShiftsV2` and wait for `Bookings`: `playwright/e2e/shift/timekeeping.spec.ts` has multiple such assertions, plus `playwright/e2e/shift/scheduledBookingCard.spec.ts`, `playwright/e2e/homeHealth/workerVisitLifecycle.spec.ts`, `playwright/e2e/homeHealth/workerAcceptsVisitInvite.spec.ts`, and `playwright/e2e/auth/authByEmail.spec.ts`.

**Validation plan:**

- Run the new focused Vitest file with `npx vitest run --config ./src/appV2/vitest.config.ts src/appV2/lib/GoogleMaps/<new-test-file>.test.tsx`.
- Run the targeted E2E when Playwright env vars are available: `npx playwright test playwright/e2e/shift/timekeeping.spec.ts:627 --project "Mobile Chrome" --config ./playwright.config.ts`.
- Run repo verification appropriate for the final diff, at minimum the touched test suite and `npm run verify` if the branch is being finalized.

**Open questions:** None before implementation. Prefer the provider-local degradation fix over changing the Bookings assertion or adding a longer wait, because the page is on the app crash screen.

**Residual risk:** If Google Maps is actually required during a later step of a different E2E, the provider fallback alone preserves app rendering but map-specific UI may still need a deterministic Playwright SDK stub.

## Implementation instructions

- Implement this plan using the `cb-work` skill, or the `core:go` skill if `cb-work` is unavailable.
- Include this implementation ticket ID in the change body.
- Keep the fix scoped; do not change the Timekeeping test assertion into a longer timeout/retry because the observed failure is an app crash before Bookings can render.
