# Historical plan snapshot

## Implementation task

Implement the flaky-test-debugger plan from [ticket redacted] for this Playwright E2E flake.

## Required change / commit instructions

- Include this implementation ticket ID in the change body.
- Implement this plan using the `cb-work` skill or, if unavailable, the `core:go` skill.

## Flake details

```json
{
  "repo": "[admin frontend]",
  "test": "Schedule daily view (redesign) — desktop workplace user posts a single shift from the Add Shift side panel (SCHEDULE_VIEW_POST_LAUNCH on)",
  "file": "playwright/e2e/dailyView.spec.ts:420",
  "framework": "playwright",
  "isNewFlaky": false,
  "failures": [
    {
      "error": "TimeoutError: locator.click: Timeout 30000ms exceeded. Call log: waiting for getByRole('combobox', { name: 'Role' }); locator canonical; element was not stable; element was detached from the DOM, retrying",
      "branch": "main",
      "pipeline": "[external evidence reference]",
      "commit": "b568dcdc304406da26be6128e183cae35390fa64",
      "durationMs": 57388,
      "shard": "2/4",
      "timestamp": "2026-07-02T19:06:56Z"
    }
  ]
}
```

## Flaky-test-debugger plan

**Test ID:** `b03b0307e93e39946710-71ce947e36caa7d4ae78`

**Confidence:** 4/5. The Playwright LLM report and screenshot show the panel/Role field is transient after opening, but the report does not retain a close-state RUM event or DOM snapshot at the exact detach moment, so the precise close/remount trigger is inferred.

**Failure surface:** User action no-op / test harness synchronization.

**Current main status:** Still relevant. The failing helper still performs `await page.getByRole("combobox", { name: "Role" }).click()` immediately after visible checks in `playwright/e2e/dailyView.spec.ts`. Recent main contains prior stabilizations from [ticket redacted]/[ticket redacted] and a later roster Add Shift panel change (`aaa7a899d7e`), but no current open `flaky-test-fix` change and no later change that waits for the Role combobox to be actionable after the side-panel transition/remount window.

**Symptom:** Failed attempt opened the Add Shift panel, saw the `Add Shift` title and visible Role combobox, then timed out for 30s clicking the Role combobox. Playwright reported the element was not stable and was detached from the DOM. The failure screenshot shows the schedule page without the Add Shift side panel.

**Root cause:** The test starts Role selection as soon as the panel title and Role field are visible. Visibility is too early for this surface: the desktop Add Shift side panel is animated and its form can still re-render/reset while route/day data and panel-related queries settle. The first destructive operation is not the role click, so the test can safely make the panel-open/role-selection phase idempotent before posting, instead of relying on one immediate Role click.

**Evidence:**

- LLM report summary: 52 total tests, 49 passed, 1 flaky, 2 skipped; this test failed attempt 1 and passed attempt 2.
- Failed attempt timeline: `openAddShiftPanel` clicked `Add` at ~26.25s, `Add Shift` was visible at ~26.37s, Role was visible at ~26.386s, and the Role click started at ~26.391s then timed out after 30s.
- Error artifact: `locator.click` on `getByRole('combobox', { name: 'Role' })` hit unstable element and DOM detachment.
- Screenshot artifact: final failure image shows the daily schedule with no Add Shift side panel open.
- Network/lifecycle: no `POST /v3/shifts` was emitted. The failed attempt had 333 observed network instances with no group/instance-cap drops; background schedule/workplace/default-time requests were still active around the panel-open window. `GET /api/shiftTimes/get/...qualification=CNA` returned 200.
- RUM artifact: retained custom action `HCF Admin Web App (V2): Schedule add shift panel state changed` with `isOpen: true`; no retained matching close event.
- Code path: `postSingleShiftViaAddPanel` in `playwright/e2e/dailyView.spec.ts` waits for title/Role visibility, then immediately clicks Role. `openAddShiftPanel` retries the safe Add click but does not wait for the side-panel transition or Role actionability.

**Proposed fix:** Test harness fix in `playwright/e2e/dailyView.spec.ts`.

1. Add a small helper for the safe pre-post phase, for example `selectRoleInAddShiftPanel({ page, roleName: "CNA" })`.
2. In that helper, use `expect(...).toPass()` around only idempotent actions:
   - ensure the Add Shift panel is open; if it disappeared before any post, call `openAddShiftPanel` again;
   - locate the Role combobox;
   - use `roleCombobox.click({ trial: true, timeout: 5_000 })` to wait for Playwright actionability/stability without changing state;
   - if the combobox is not already the desired role, click it and choose the option;
   - assert the combobox contains the chosen role before leaving the retry block.
3. Keep the destructive post flow outside any retry: wait for date/default times/Post enabled, create the `waitForResponse` promise, click Post once, handle optional rush-fee dialog, then assert the panel closes.
4. Reuse the same helper for the mobile bottom-sheet test because it calls the same `postSingleShiftViaAddPanel` path. Do not add `waitForTimeout`; use actionability/trial click and assertions as deterministic signals.

**Observability to reach 5/5:**

- Add a close-reason field to the existing Add Shift panel RUM state event (`closeButton`, `postSuccess`, `inviteSuccess`, `hostOverlayReplacement`, `unmount`, etc.) so the next occurrence proves whether the panel ended, remounted, or only moved during transition.
- Extend the Playwright reporter or test helper to attach a targeted screenshot/DOM snapshot when a locator actionability failure mentions `detached from the DOM`, especially for panel/dialog surfaces.
- Consider adding a test-only `data-testid` or stable panel root role/name for Add Shift panel scoping if the helper still has to use global locators.

**Sibling candidates:** The mobile Add Shift bottom-sheet E2E in the same file shares `postSingleShiftViaAddPanel`; update it automatically through the shared helper. No other E2E currently performs this exact Add Shift panel Role selection.

**Validation plan:**

- `npx oxfmt --check playwright/e2e/dailyView.spec.ts`
- `npm run lint -- playwright/e2e/dailyView.spec.ts`
- If deployed E2E env credentials are available: `npm run playwright:run -- --grep "posts a single shift from the Add Shift"`
- If local Playwright cannot start because `TEST_HELPER_API_KEY` / deployed API env is missing, state that in the change and rely on CI for the E2E run.

**Open questions:** None.

**Residual risk:** If the panel is genuinely closing for real users without any outside click, the test-harness fix may mask a product bug. The close-reason telemetry above would make that distinguishable in the next occurrence.
