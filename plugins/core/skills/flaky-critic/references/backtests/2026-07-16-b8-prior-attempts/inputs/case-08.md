# Historical plan snapshot

## Groundcrew

Repository: `[admin frontend]`
Implementation workflow: use the `cb-work` skill. If unavailable, use the `core:go` skill.

Include this implementation ticket ID in the change body.

```bash

```

## Source Investigation

Investigation ticket: [ticket redacted]
Skill/mode: `flaky-debug` in plan mode. The requested `flaky-test-debugger` skill was not installed under that exact name, so this used the available Clipboard flaky-debug skill.

## Flake Details

```json
{
  "repo": "[admin frontend]",
  "test": "Home Health Full Lifecycle complete home health workflow: create case, manage visits, verify and reject occurrences, close case",
  "file": "playwright/e2e/homeHealth/fullLifecycle.spec.ts:1170",
  "framework": "playwright",
  "isNewFlaky": false,
  "failures": [
    {
      "error": "TimeoutError: locator.click: Timeout 5000ms exceeded.\nCall log:\n  - waiting for getByRole('dialog').filter({ hasText: 'Are you sure you want to close this case?' }).getByRole('button', { name: 'Close', exact: true })\n    - locator canonical to <button tabindex=\"0\" type=\"button\" class=\"MuiButtonBase-root MuiButton-root MuiButton-contained MuiButton-containedPrimary MuiButton-sizeMedium MuiButton-containedSizeMedium MuiButton-fullWidth MuiButton-root MuiButton-contained MuiButton-containedPrimary MuiButton-sizeMedium MuiButton-containedSizeMedium MuiButton-fullWidth css-6qhbw3\">…</button>\n  - attempting click action\n    - waiting for element to be visible, enabled and stable\n    - element is not stable\n  - retrying click action\n    - waiting for element to be visible, enabled and stable\n  - element was detached from the DOM, retrying\n",
      "stack": "TimeoutError: locator.click: Timeout 5000ms exceeded.\nCall log:\n  - waiting for getByRole('dialog').filter({ hasText: 'Are you sure you want to close this case?' }).getByRole('button', { name: 'Close', exact: true })\n    - locator canonical to <button tabindex=\"0\" type=\"button\" class=\"MuiButtonBase-root MuiButton-root MuiButton-contained MuiButton-containedPrimary MuiButton-sizeMedium MuiButton-containedSizeMedium MuiButton-fullWidth MuiButton-root MuiButton-contained MuiButton-containedPrimary MuiButton-sizeMedium MuiButton-containedSizeMedium MuiButton-fullWidth css-6qhbw3\">…</button>\n  - attempting click action\n    - waiting for element to be visible, enabled and stable\n    - element is not stable\n  - retrying click action\n    - waiting for element to be visible, enabled and stable\n  - element was detached from the DOM, retrying\n\n    at submitCloseCase (/opt/actions-runner/_work/[admin frontend]/[admin frontend]/playwright/e2e/homeHealth/fullLifecycle.spec.ts:792:17)\n    at /opt/actions-runner/_work/[admin frontend]/[admin frontend]/playwright/e2e/homeHealth/fullLifecycle.spec.ts:1782:9\n    at /opt/actions-runner/_work/[admin frontend]/[admin frontend]/playwright/e2e/homeHealth/fullLifecycle.spec.ts:1774:7\n    at WorkerMain._runTest (/opt/actions-runner/_work/[admin frontend]/[admin frontend]/node_modules/dd-trace/packages/datadog-instrumentations/src/playwright.js:1692:5)",
      "branch": "main",
      "pipeline": "[external evidence reference]",
      "commit": "ae7ad5ee34fd9d833c47c68aec34f8d3e4c03745",
      "durationMs": 56753,
      "shard": "2/4",
      "timestamp": "2026-07-06T17:16:19Z"
    }
  ]
}
```

## Plan Output

**Test ID:** `[bf2e9756e2c0]`

**Confidence:** 4/5. The failure artifact directly shows the close dialog button was visible/enabled, the click timed out because the element became unstable/detached, and no close-case PATCH was emitted. The exact reason the dialog disappeared is inferred from UI/test timing, so this is not 5/5.

**Failure surface:** User action no-op / test harness. The app reached the confirmation dialog, but the destructive close-case request never started.

**Current main status:** The failing code path still exists on current main/worktree in `playwright/e2e/homeHealth/fullLifecycle.spec.ts`: `submitCloseCase` waits for `PATCH /cases/{caseId}` and clicks the `Close` button in a single `Promise.all` at lines 784-792. No open change with label `flaky-test-fix` matched this file. Recent commit `28bdf114626` / [ticket redacted] fixed a different close-case flake where the PATCH succeeded and the helper retried a one-shot mutation; this new failure happens before the PATCH starts.

**Symptom:** In Step j, `submitCloseCase` times out on `closeButton.click({ timeout: ATTEMPT_TIMEOUT_MS })`. Playwright reports the button canonical, then was unstable and detached. The paired `waitForHomeHealthResponse` also times out because no matching `PATCH /[home-health service]/api/v1/*/cases/{caseId}` occurs.

**Root cause:** `submitCloseCase` treats one transient close-dialog/button remount as terminal. The close dialog is mounted under `CaseActionsMenu` / `CaseClosureDialog`; the failed run shows it can disappear or remount during the click window before the close PATCH starts. The helper lacks the request-observed guard used elsewhere in this spec for visit verification actions, so a pre-request click detach fails the test instead of safely reopening the dialog and trying again.

**Evidence:**

- LLM report summary: 52 tests total, 49 passed, 1 flaky, 2 skipped. This test failed first attempt and passed retry.
- Failed timeline around Step j: `Case Actions` clicked at ~49071ms, `Close Case` clicked at ~49113ms, dialog text visible at ~49374ms, `Close` button visible/enabled at ~49391-49394ms, then both `waitForResponse` and `Click ... Close` start at ~49398ms and time out after 5000ms.
- Failed network activity after the close click contains Datadog/Braze and unrelated `/api/extra-worked-time-requests` and `/api/user/get` requests, but no `PATCH /[home-health service]/api/v1/.../cases/{caseId}`.
- Failure screenshot shows the dialog is gone, the case is still visible under Active Cases, and the case has not moved to ended Cases.
- Passed retry follows the same Step j path and completes: click Case Actions, click Close Case, see close dialog, click Close, settle Active Cases, then verify the case under ended Cases.
- Product code path: `src/appV2/ExperimentalHomeHealth/Cases/CaseDashboard/CaseClosureDialog.tsx` only calls `updateCase` from the `Close` button handler, then closes the modal after success; `useUpdateCase` invalidates open/ended case queries on success.

**Proposed fix:** Test harness only, in `playwright/e2e/homeHealth/fullLifecycle.spec.ts`.

1. Refactor `submitCloseCase` to mirror the existing request-observed pattern used by `clickVisitOccurrenceActionButtonUntilPatchObserved`.
2. Start a close-case response result promise with `waitForHomeHealthResponseResult({ action: "close case", isMatchingRequest: (request) => isCaseUpdateRequest(request, caseId), timeout: ACTION_TIMEOUT_MS })` before retrying pre-request UI work.
3. Add a helper such as `clickCloseCaseButtonUntilPatchObserved({ page, closureDialog, caseId })` that:
   - creates `page.waitForRequest((request) => isCaseUpdateRequest(request, caseId), { timeout: ATTEMPT_TIMEOUT_MS }).then(() => true, () => false)`;
   - locates the Close button fresh from the current dialog;
   - asserts visible/enabled and clicks;
   - if the click throws but the PATCH was observed, returns success;
   - if no PATCH was observed, throws a retryable pre-request error.
4. Wrap only the pre-mutation open/fill/click path in `expect(...).toPass({ intervals: [500, 1_000, 2_000], timeout: ACTION_TIMEOUT_MS })` so retries are allowed before a close PATCH starts, but the mutation itself is still executed once.
5. After the helper observes the PATCH, await the response result with `getSuccessfulHomeHealthResponse`, assert `data.attributes.status === CaseStatus.[attempt reference redacted]`, settle the dashboard, and assert the active case card disappears.
6. Add close-case diagnostics on final failure, similar to `attachCancelVisitDialogOpenDiagnostics`: visible dialog texts, close button count/visible/enabled, case card text, current URL, whether the close PATCH was observed, and a screenshot attachment if useful.
7. Do not use `force: true`, fixed sleeps, or a longer click timeout as the fix.

**Observability to reach 5/5:** Add the close-case test diagnostics above. They would confirm whether the dialog ended from an `onClose`, remounted with a new button, or disappeared because the case card subtree remounted. No backend telemetry is required for this occurrence because the expected backend request never started.

**Sibling candidates:** The exact `Promise.all([waitForHomeHealthResponse, closeButton.click])` anti-pattern is localized to close case. Review nearby destructive dialog submits in the same file while implementing: cancel visit confirmations and remove booked worker use a request promise plus direct click; they may not need changes, but should be checked against the same request-observed guard criterion.

**Validation plan:**

```bash
npx oxfmt --check playwright/e2e/homeHealth/fullLifecycle.spec.ts
npx oxlint playwright/e2e/homeHealth/fullLifecycle.spec.ts
npm run lint:fast
npm run typecheck
npm run playwright:run -- playwright/e2e/homeHealth/fullLifecycle.spec.ts --grep "complete home health workflow"
```

If local Playwright setup requires deployed-env credentials, record the setup blocker and run the smallest available lint/typecheck verification locally.

**Open questions:** None for implementation. The fix should not require product-code changes unless new diagnostics show real user-visible close-dialog dismissal without a request.

**Residual risk:** The full lifecycle spec has several independently flaky surfaces. This plan only addresses the close-case confirm-button detach before the PATCH starts; later ended-tab verification or unrelated home-health API/setup flakes can still fail separately.
