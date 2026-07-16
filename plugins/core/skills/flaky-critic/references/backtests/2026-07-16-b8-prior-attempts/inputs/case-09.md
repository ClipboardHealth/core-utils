# Historical plan snapshot

## Groundcrew

Repository: [mobile frontend]
GitHub repo: [mobile frontend]
Implementation workflow: use the `cb-work` skill or, if unavailable, the `core:go`/`go` skill.

## Task

Stabilize the MPR V2 Playwright flow in `playwright/e2e/shift/timekeeping.spec.ts` by making `selectMinuteThatRequiresClockInApproval` avoid low-minute loop-boundary clicks that can settle the wheel into a same-hour future time.

Suggested smallest fix: update `getTargetMinuteForClockInApproval` so it avoids both `00` and the `01 -> 00` path. For this flow, a slightly later minute is still earlier than the actual worker clock-in because the shift is already in progress; it only needs to dirty the picker and trigger the approval step. A conservative helper shape is:

```ts
function getTargetMinuteForClockInApproval(selectedMinute: number): number {
  if (selectedMinute <= 1) {
    return selectedMinute + 1;
  }

  return selectedMinute - 1;
}
```

Consider using a slightly wider low-minute guard, for example `selectedMinute <= 5`, if local trace review shows the smooth scroll can settle across several low-minute values. Keep the change test-harness-only unless the implementation investigation proves a real product bug in `WheelTimePicker` click/scroll-end behavior.

## Acceptance Criteria

- [ ] The MPR V2 E2E helper no longer clicks `0 minutes` when the selected minute is `1`.
- [ ] The helper still reaches the approval-step UI by waiting for the earlier-clock-in approval copy and enabled `Next` button.
- [ ] The change body includes this implementation ticket ID.
- [ ] Targeted formatting/linting and the smallest practical Playwright verification are run or the Playwright environment blocker is documented.

## Flake Details

```json
{
  "repo": "[mobile frontend]",
  "test": "Missed punch request should complete MPR V2 flow: already started working, edit clock-in, and submit timesheet",
  "file": "playwright/e2e/shift/timekeeping.spec.ts:920",
  "framework": "playwright",
  "isNewFlaky": false,
  "failures": [
    {
      "error": "Error: Clock-in approval state not reached after clicking 55 minutes; selected minute: 55; Next enabled: false; approval copy: <not visible>\n\nCall Log:\n- Timeout 30000ms exceeded while waiting on the predicate",
      "stack": "Error: Clock-in approval state not reached after clicking 55 minutes; selected minute: 55; Next enabled: false; approval copy: <not visible>\n\nCall Log:\n- Timeout 30000ms exceeded while waiting on the predicate\n    at selectMinuteThatRequiresClockInApproval (/home/runner/work/[mobile frontend]/[mobile frontend]/playwright/e2e/shift/timekeeping.spec.ts:147:6)\n    at /home/runner/work/[mobile frontend]/[mobile frontend]/playwright/e2e/shift/timekeeping.spec.ts:975:11\n    at WorkerMain._runTest (/home/runner/work/[mobile frontend]/[mobile frontend]/node_modules/dd-trace/packages/datadog-instrumentations/src/playwright.js:1692:5)",
      "branch": "gh-readonly-queue/main/change-[reference redacted]-139c9148f92f65dc0d8f2a8f642c56fea71e4e95",
      "pipeline": "[external evidence reference]",
      "commit": "eece17af4aa80924757ee2444f013dadb956d75e",
      "durationMs": [attempt reference redacted],
      "shard": "3/4",
      "timestamp": "2026-06-25T14:06:34Z"
    }
  ]
}
```

## Plan Output

**Test ID:** `a51c4867d1e5326a80d8-240a586ace394c9bb6fb`

**Confidence:** 4/5. The LLM report, trace steps, and screenshot directly show the failed UI state. One link is inferred: the report does not expose the wheel column `scrollTop` or scroll-end events, so the exact mechanism that moves from `0` to high-50s minutes is inferred from the step sequence and component behavior.

**Failure surface:** User action no-op / test harness. The click actions completed, but the expected approval-state transition did not remain reachable. No relevant backend request was emitted during the failed picker-selection loop.

**Current main status:** Still applicable on current `origin/main`/branch head `e12d296a7e8`. No open GitHub change labeled `flaky-test-fix` was found. Recent main commits `893373a2abb` and `ba607976ecd` stabilized this same MPR picker area but do not cover the `selectedMinute === 1 -> click 0` low-minute boundary seen here.

**Symptom:** `selectMinuteThatRequiresClockInApproval` timed out at `playwright/e2e/shift/timekeeping.spec.ts:147`. The final diagnostic was: `Clock-in approval state not reached after clicking 55 minutes; selected minute: 55; Next enabled: false; approval copy: <not visible>`.

**Root Cause:** The test helper derives each retry target from the currently selected minute and usually subtracts one. When the selected minute is `1`, it clicks `0 minutes`. In this live E2E flow the looped `WheelTimePicker` uses smooth scrolling and scroll-end recentering; after the low-minute boundary click, subsequent retries observed/clicked high minute values (`57`, `56`, `55`, `54`). Those same-hour high-minute selections were in the future relative to browser time, so `useClockInTimeValidation` showed the future-time error, hid the approval copy, and left the footer as disabled `Save` instead of enabled `Next`.

**Evidence:**

- LLM report summary for run [reference redacted]`: 45 total, 44 passed, 1 flaky; this test failed on attempt 1 and passed on attempt 2.
- Failed attempt timeline reached `Adjust clock in` at offset `68591ms`, then the helper clicked minute options `0`, `57`, `56`, `55`, and `54` before timing out.
- Passing retry reached `Adjust clock in` at offset `28654ms`, clicked `2 minutes`, saw the approval copy, found `Next` enabled, and completed the full flow.
- Failure screenshot shows the adjustment sheet with error copy `This time (7:54 AM) is in the future. Please end your shift before requesting shift payment.`, selected `54` minutes, and a disabled `Save` button.
- The product validation path in `validateClockInTimestamp` marks selected times after `startOfMinute(new Date())` as `IN_FUTURE`; `TimekeepingAdjustmentBottomSheet` only labels the footer `Next` when `requiresApproval` is stable.
- Network summary had retained-request caps (`instancesDroppedByGroupCap: 29`, `instancesEvictedAfterAdmission: 14`), but no failed backend request explains the picker transition. The only retained 4xx was an unrelated `worker-payouts/last` 404.

**Proposed Fix:** Test harness only, in `playwright/e2e/shift/timekeeping.spec.ts`.

Update the minute target helper to avoid low-minute loop-boundary targets. At minimum, handle `selectedMinute <= 1` by clicking a later safe minute, not `0`. This keeps the selected adjusted time earlier than the actual worker clock-in in this scenario while avoiding the looped wheel boundary that can settle into future high-minute values.

Optionally improve diagnostics in `getMinuteSelectionDiagnostics` to include the visible footer button text, visible intent/error copy, selected hour/minute/meridiem labels, and browser `new Date().toISOString()` so the next failure is self-contained.

**Observability to Reach 5/5:**

- Frontend/test reporter: include selected hour/minute/meridiem, all visible intent/error banner text, visible footer button names, and browser current time in the helper failure message.
- If the low-minute fix does not settle the flake, add temporary Playwright trace diagnostics for the minutes listbox `scrollTop` and selected option before/after each click to prove whether `WheelColumn` scroll-end recentering is overriding `onSelect`.
- Backend telemetry is not required for this failure unless a future occurrence emits `validate_timekeeping_action` during the failed transition.

**Sibling Candidates:**

- Primary: `playwright/e2e/shift/timekeeping.spec.ts` helper `getTargetMinuteForClockInApproval` / `selectMinuteThatRequiresClockInApproval`.
- Review but do not preemptively patch: `src/appV2/redesign/components/WheelTimePicker/WheelColumn.tsx`, because a real product click/scroll bug would need separate proof.

**Validation Plan:**

- `npx oxfmt --check playwright/e2e/shift/timekeeping.spec.ts`
- `npm run lint -- playwright/e2e/shift/timekeeping.spec.ts`
- If the local Playwright environment is available: `npx playwright test --config ./playwright.config.ts --project "Mobile Chrome" playwright/e2e/shift/timekeeping.spec.ts --grep "already started working"`
- If Playwright setup is missing, run/document `npm run playwright:setup` and the blocker, then rely on CI for the live E2E run.

**Open Questions:** None blocking. The implementation can proceed with a test-harness-only change.

**Residual Risk:** This flow still depends on live E2E services and real wall-clock time. If the wheel component itself can override clicked selections after smooth scroll in normal user interaction, the test-harness fix will reduce flakes but not address that broader product behavior.
