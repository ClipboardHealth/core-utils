# Historical plan snapshot

## Groundcrew

Repository: [mobile frontend]
Implementation workflow: use the `cb-work` skill when available. If that skill is unavailable, use the `core:go` skill.

## Task

Fix the flaky Playwright flow where the rate-negotiation `SlideToConfirmButton` sometimes does not invoke the proposal action, leaving the test on `/shift-negotiation/:shiftId` after the slide gesture instead of navigating back to `/shift/:shiftId`.

Include this implementation ticket ID in the change body.

## Flake Details

```json
{
  "repo": "[mobile frontend]",
  "test": "Rate Negotiations new UI should propose new rate for a shift and end negotiation",
  "file": "playwright/e2e/rateNegotiations/rateNegotiationv2.spec.ts:369",
  "framework": "playwright",
  "isNewFlaky": false,
  "failures": [
    {
      "error": "Error: expect(page).toHaveURL(expected) failed\n\nExpected: \"[external evidence reference]"\nReceived: \"[external evidence reference]"\nTimeout: 30000ms",
      "stack": "rateNegotiationv2.spec.ts:466",
      "branch": "main",
      "pipeline": "[external evidence reference]",
      "commit": "7638c4bd74e598414254053d8c97e0611dbad943",
      "durationMs": 52870,
      "shard": "2/4",
      "timestamp": "2026-07-06T16:26:13Z"
    }
  ]
}
```

## Plan Output

Confidence: 4/5. The failure artifact directly shows the slide CTA still open after the gesture, and the component code has a concrete stale-state completion check. Confidence is not 5/5 because the LLM report hit network retention caps, so absence of a retained `POST /negotiation` is strong but not absolute proof that no mutation request was emitted.

Failure surface: User action no-op, with product component behavior as the likely root and test harness diagnostics as a secondary improvement.

Current main status: The affected code path still exists on current `origin/main`/HEAD `a58a6893d9c025196f1b10bff49b548f2cd03910`. No open change with label `flaky-test-fix` matched this test or file. Commit `77129b26883` landed after the failing commit and only adds `workerAuthToken` to shift-offer setup; it does not address the slide/no-op path.

Symptom: In failed attempt 0, the test executes `slideToConfirmButton(page, "Slide to propose $33.00/hr")`, then `expect(page).toHaveURL(shiftDetailsPath)` times out at `playwright/e2e/rateNegotiations/rateNegotiationv2.spec.ts:467`. The actual URL stays `/home-v2/shift-discovery/list/shift-negotiation/6a4bd731b22f99dbbc009a7d`.

Root cause: `SlideToConfirmButton` decides whether the slide completed in `handlePointerUp` using React state `offsetX`. During a fast drag/release, especially under CI load, the last `pointermove` can call `setOffsetX(...)` but `pointerup` can still observe the previous render's `offsetX` value. That makes the component reset to 0 and skip `onConfirm()`, even though the pointer moved far enough. The Playwright helper triggers this edge by moving and releasing quickly after the rate-negotiation footer migration to `SlideToConfirmButton` in commit `7638c4bd74e`.

Evidence:

- LLM report `/tmp/playwright-llm-report-28806486162/llm-report.json` has one flaky test in the shard: 15 passed, this test passed only on retry.
- Failed timeline: `Bounding box getByText('Slide to propose $33.00/hr').locator('../..')` at 20536ms, `Mouse move` at 20541ms, `Mouse down` at 20545ms, `Mouse move` at 20562ms, `Mouse up` at 21272ms, then `Expect "toHaveURL"` fails at 21275ms.
- Failure screenshot shows the `Shift Rate Negotiation` bottom sheet still open with `Slide to propose $33.00/hr`; it is not in loading/success state and has not navigated away.
- Retained negotiation network entries around the slide are reads only: `GET /api/negotiation/shifts/:shiftId?offerId=...` at 19826ms and 20878ms. There is no retained `POST /negotiation` proposal write near the slide. The report did hit network caps (`instancesDroppedByGroupCap: 17`, `instancesEvictedAfterAdmission: 10`), so this supports but does not solely prove the no-op.
- `src/appV2/redesign/system/ui-components/components/SlideToConfirmButton/index.tsx` lines 177-209 update `offsetX` in `handlePointerMove` and read `offsetX` in `handlePointerUp` to decide `offsetX / currentMax >= 0.8`.
- `playwright/utils/button.ts` lines 43-59 uses a generic fast mouse drag for every `SlideToConfirmButton`; `playwright/e2e/rateNegotiations/rateNegotiationv2.spec.ts` uses it at lines 464 and 634. Timekeeping E2Es also use the same helper.
- There is no dedicated `SlideToConfirmButton` component test file covering fast drag/release behavior.

Proposed fix:

1. In `src/appV2/redesign/system/ui-components/components/SlideToConfirmButton/index.tsx`, stop using render-state `offsetX` as the source of truth inside `handlePointerUp`. Compute the release offset from the current `PointerEvent` (`event.clientX - dragStateRef.current.startX`) and/or keep the latest clamped offset in a ref that is updated synchronously in `handlePointerMove`. Use that computed/ref value for the threshold check, then update state for rendering.
2. Keep the reset/complete state transitions the same: partial drags reset to 0; completed drags set to max, mark complete, and call `onConfirm()` exactly once.
3. Add focused appV2 component coverage for `SlideToConfirmButton`: a fast drag that crosses the threshold and releases immediately calls `onConfirm`, a partial drag does not, and disabled/loading states still do not call `onConfirm`. Prefer user-facing queries where possible; if the current component lacks accessible semantics, keep the test scoped to the rendered CTA text and pointer events.
4. Improve E2E diagnostics around the proposal action in `playwright/e2e/rateNegotiations/rateNegotiationv2.spec.ts`: after sliding, wait for the deterministic proposal mutation or a post-success route/UI signal so a future no-op fails at the missing `POST /negotiation`/confirm signal instead of a 30s URL timeout. Avoid arbitrary sleeps or blind retries.

Observability to reach 5/5:

- Add deterministic Playwright evidence around the slide action: wait for the `POST /negotiation` request/response after the proposal slide and include its absence in the failure path.
- If touching the component, consider adding temporary debug output gated by the existing E2E/debug localStorage pattern or test-only attachments for slide metrics (`startX`, release delta, max offset, threshold result) if the component remains hard to diagnose in traces.
- No backend telemetry is required for this plan unless the deterministic wait proves the mutation is emitted and failing server-side.

Sibling candidates:

- `playwright/e2e/rateNegotiations/rateNegotiationv2.spec.ts:634` uses the same helper in the counter-proposal path.
- `playwright/e2e/shift/timekeeping.spec.ts` uses `slideToConfirmButton` for clock-out flows at lines 663, 755, 858, and 1010.
- All product uses of shared `SlideToConfirmButton` inherit the stale pointer-state behavior, including shift cancel, timekeeping, booking confirmation, Clipboard Score, and rate negotiation.

Validation plan:

- `npm run test:v2 src/appV2/redesign/system/ui-components/components/SlideToConfirmButton/SlideToConfirmButton.test.tsx`
- `npm run test:v2 src/appV2/Negotiations/RateNegotiationBottomSheet.test.tsx`
- With a valid `playwright.env`, run `npx playwright test playwright/e2e/rateNegotiations/rateNegotiationv2.spec.ts --project "Mobile Chrome" --config ./playwright.config.ts`
- Run the repo's standard verification command if required by the final diff scope.

Open questions: None blocking. The highest-confidence local fix is in the shared slide component; the E2E change should improve diagnostics, not mask the product behavior.

Residual risk: If fixing the slide component reveals a real backend/post-success navigation issue after `POST /negotiation`, the deterministic E2E wait should expose that as a different failure surface with a request/response artifact.

## Acceptance Criteria

- [ ] Fast slide/release over the completion threshold reliably calls `onConfirm` in `SlideToConfirmButton`.
- [ ] Partial/disabled/loading slide cases remain unchanged.
- [ ] The rate-negotiation proposal E2E waits on a deterministic proposal or post-success signal instead of relying only on a later URL timeout.
- [ ] Validation commands above pass or any environment-only blocker is documented in the change.

## Related

Investigation ticket: `[ticket redacted]`
