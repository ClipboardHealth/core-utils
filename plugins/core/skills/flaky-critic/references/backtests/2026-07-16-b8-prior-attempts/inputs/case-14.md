# Historical plan snapshot

## Groundcrew

Repository: [admin frontend]
Implementation workflow: use the `cb-work` skill. If unavailable, use the `core:go` skill.

Include this implementation ticket ID in the change body.

```bash

```

## Flake Details

```json
{
  "repo": "[admin frontend]",
  "test": "Home Health Full Lifecycle complete home health workflow: create case, manage visits, verify and reject occurrences, close case",
  "file": "playwright/e2e/homeHealth/fullLifecycle.spec.ts:876",
  "framework": "playwright",
  "isNewFlaky": false,
  "failures": [
    {
      "error": "Error: expect(locator).toBeVisible() failed\n\nLocator: getByRole('dialog').getByText('Cancel Regular visit')\nExpected: visible\nTimeout: 30000ms\nError: element(s) not found\n\nCall log:\n  - Expect \"toBeVisible\" with timeout 30000ms\n  - waiting for getByRole('dialog').getByText('Cancel Regular visit')\n",
      "stack": "Error: expect(locator).toBeVisible() failed\n\nLocator: getByRole('dialog').getByText('Cancel Regular visit')\nExpected: visible\nTimeout: 30000ms\nError: element(s) not found\n\nCall log:\n  - Expect \"toBeVisible\" with timeout 30000ms\n  - waiting for getByRole('dialog').getByText('Cancel Regular visit')\n\n    at /opt/actions-runner/_work/[admin frontend]/[admin frontend]/playwright/e2e/homeHealth/fullLifecycle.spec.ts:1272:81\n    at /opt/actions-runner/_work/[admin frontend]/[admin frontend]/playwright/e2e/homeHealth/fullLifecycle.spec.ts:1252:7\n    at WorkerMain._runTest (/opt/actions-runner/_work/[admin frontend]/[admin frontend]/node_modules/dd-trace/packages/datadog-instrumentations/src/playwright.js:1692:5)",
      "branch": "main",
      "pipeline": "[external evidence reference]",
      "commit": "c0fc2cd743575ada27d544cea455e13cd45caf28",
      "durationMs": 51423,
      "shard": "2/4",
      "timestamp": "2026-07-05T01:07:09Z"
    }
  ]
}
```

## Investigation Plan Output

**Test ID:** [ticket redacted] / sighting-key `a5a77ac290d27dc9`

**Confidence:** 4/5. The trace and failure screenshot directly show the cancel button click completed, no dialog was present afterward, and the case visits section was collapsed at failure. The exact React state transition that collapsed/unmounted the visits subtree is inferred rather than directly instrumented.

**Failure surface:** User action no-op / test harness race. The action target existed and Playwright completed the click, but the expected dialog did not start/render before the visit subtree was collapsed/unmounted. No cancellation backend request was emitted.

**Current main status:** Still present on current `origin/main` / HEAD `56b4dfa7131b6f6b84989145d8f0c2657811c252`. The failing path in `playwright/e2e/homeHealth/fullLifecycle.spec.ts` still does a single click followed by `page.getByRole("dialog").getByText("Cancel Regular visit")`. `CaseCard` still stores expansion state locally with `useModalState(ModalStatus.ended)` and `Collapse unmountOnExit`, and `CancelVisitDialog` still lives under `VisitActions` inside that collapsible visit subtree.

**Symptom:** In Step e, `findVisitRowByWorker` found the booked worker row and the row's `Cancel Visit` button. The test clicked it, then timed out for 30s waiting for `getByRole('dialog').getByText('Cancel Regular visit')` at `playwright/e2e/homeHealth/fullLifecycle.spec.ts:1272`.

**Root Cause:** The cancel-visit path is less resilient than the other hardened home-health dialog helpers. It assumes the visit subtree remains expanded and that one button click will synchronously expose the cancel dialog. In the failed attempt, the subtree was collapsed by the time the dialog assertion began, so the `CancelVisitDialog` mounted under `VisitActions` was not present. Because the helper returns a `Locator` after finding the row but does not re-check expansion or retry opening the dialog, the test can lose the row/dialog state between row lookup and assertion.

**Evidence:**

- LLM report artifact `playwright-llm-report` for run [reference redacted]` has schema v3 summary: 52 total tests, 49 passed, 1 flaky, 0 final failures. This test failed once and passed on retry.
- Failed attempt error: `getByRole('dialog').getByText('Cancel Regular visit')` timed out after 30000ms at line 1272.
- Failed attempt trace: `findVisitRowByWorker` reloaded the page, expanded case visits, observed the booked worker link `Playwright Iiuwfojg`, observed that row's `Cancel Visit` button, then completed the click without a click-level error.
- Trace call evidence: click `call@1019` canonical to `<button aria-label="Cancel Visit" ...>`, completed at point `{x:433.12,y:516.25}`, and had no Playwright error. The next assertion `call@1023` waited 30000ms and timed out.
- Failure screenshot and `error-context` page snapshot show the target case card visible but collapsed with `Show Case Visits`, and no dialog in the DOM.
- Network evidence around the failed click shows no `PATCH /[home-health service]/api/v1/*/visits/*` cancellation request after the click. No backend cancellation request started, so this is not a backend cancellation failure.
- Existing fix check: no open change with `flaky-test-fix` matched `fullLifecycle.spec.ts` or home-health E2E. Recent main commits touched this spec for other modal/row lookup flakes, but none directly address this cancel-dialog open path.

**Proposed Fix:** Test harness fix in `playwright/e2e/homeHealth/fullLifecycle.spec.ts`.

1. Add a helper for opening the cancel-visit dialog that mirrors the hardened patterns already used for verify/reject dialogs:
   - Accept `page`, the case/row lookup inputs, the target visit id when available, and the expected dialog title.
   - In a bounded `expect(async () => ...).toPass(...)`, ensure the case visits section is expanded, ensure the target row/action button is visible and enabled, click the button only when the expected dialog is not already open, and assert the cancel dialog title plus confirmation text are visible.
   - Treat only these states as retryable: the case visits section is collapsed after lookup, the target row or action button detaches before the click, the target action is temporarily hidden/disabled, or the expected dialog title plus confirmation text are not visible after the open click while no cancellation `PATCH` has started.
   - Treat these states as non-retryable: a cancel dialog opens for a different visit, the helper has already clicked the dialog confirmation button, a cancellation `PATCH /visits/{id}` request has started, or the selected visit id no longer matches the expected visit.
   - Re-clicking `Cancel Visit` is idempotent only before confirmation because the row action opens a client-side dialog; no backend cancellation mutation starts until the dialog's confirmation button is clicked. If the matching dialog is already open, the helper should return/assert it instead of clicking again.
   - There is no single deterministic completion signal to wait on for dialog open. The row click only changes React modal state inside `VisitActions`, and `CancelVisitDialog` is mounted under the collapsible `CaseVisits` subtree with `Collapse unmountOnExit`; the cancellation network request happens later on confirmation. A bounded web-first assertion on the specific dialog title and confirmation text is therefore the narrowest observable signal.
   - Attach diagnostics on failure: whether `Show Case Visits` or `Hide Case Visits` is visible, visible dialog texts, visible action button labels, target worker/link count, target visit id if known, and visible visit IDs.
2. Use the helper for Step e's booked-visit cancellation. Consider using it for Step d's unbooked cancellation too, since Step d has the same single-click/single-dialog-assertion anti-pattern.
3. Keep the cancellation response wait scoped to the expected visit id for Step e, as it already is. For Step d, if practical, scope the `PATCH /visits` wait to the selected CNA visit id or add enough diagnostics to prove which visit was patched.
4. Confirm whether modification reason is required under this test user. If required in local/staging auth context, fill `Reason for change` before clicking the dialog's `Cancel Visit`; if not required, leave unchanged. The field is conditional via `useIsModificationReasonRequired()`.

**Observability to Reach 5/5:**

- Add test diagnostics in the new helper for dialog-open failures: expanded/collapsed case visits state, target row count, target button count, dialog count/text, visible action labels, and a short case-card text snapshot.
- Add reporter or helper-level network notes for whether a `GET /visits/{id}` or `PATCH /visits/{id}` was observed after the open click. This would distinguish “dialog never mounted” from “dialog mounted loading/error state and then unmounted.”
- Product telemetry is not required for the immediate fix, but if this reappears outside tests, add a lightweight analytics/log event for cancel dialog open failures or visit-action click-to-dialog transitions in the Home Health case dashboard.

**Sibling Candidates:**

- Step d in `playwright/e2e/homeHealth/fullLifecycle.spec.ts` (`Cancel an unbooked CNA regular visit`) uses the same direct cancel click and broad `page.getByRole("dialog")` assertion.
- Other `VisitActions` dialogs under the collapsible `CaseVisits` subtree are already partially hardened for edit/verify/reject/remove flows; review any remaining direct `page.getByRole("dialog")` open assertions in this spec before stopping.

**Validation Plan:**

- `npm run lint:fast -- playwright/e2e/homeHealth/fullLifecycle.spec.ts` if the script accepts file args; otherwise `npm run lint:fast`.
- Run the targeted deployed-env Playwright test if available in this repo/environment, or the repo's documented Playwright command for `playwright/e2e/homeHealth/fullLifecycle.spec.ts` against staging.
- At minimum, run the relevant TypeScript/lint check after editing: `npm run typecheck` if a full check is acceptable; otherwise the narrowest documented check the repo supports.

**Open Questions:** None blocking. The implementation can proceed with the conservative test-harness fix.

**Residual Risk:** The full lifecycle spec remains long and has many backend/test-data dependencies. This fix should stabilize the cancel-dialog open race, but separate flakes in auth, backend eventual consistency, case visit row lookup, or occurrence verification can still surface in the same test.

## Acceptance Criteria

- [ ] Step e opens the booked-visit cancel dialog through a bounded deterministic helper rather than a one-shot click/assertion.
- [ ] The helper documents and enforces retryable vs non-retryable states before retrying an open click.
- [ ] The helper only re-clicks `Cancel Visit` while no matching dialog is open, no confirmation click has happened, and no cancellation `PATCH` has started.
- [ ] The helper uses the specific dialog title and confirmation text as the bounded web-first assertion because there is no earlier deterministic open-completion signal.
- [ ] Step d either uses the same helper or is explicitly ruled out with evidence.
- [ ] Failure diagnostics identify whether the case visits section is collapsed, the target row/action is missing, a dialog is loading/erroring, a different visit dialog is open, or no dialog exists.
- [ ] The change body includes this implementation ticket ID.

## Related Tickets

Investigation source: [ticket redacted]

Prior related tickets from the source task: [ticket redacted], [ticket redacted], [ticket redacted], [ticket redacted], [ticket redacted], [ticket redacted], [ticket redacted], [ticket redacted], [ticket redacted], [ticket redacted].
