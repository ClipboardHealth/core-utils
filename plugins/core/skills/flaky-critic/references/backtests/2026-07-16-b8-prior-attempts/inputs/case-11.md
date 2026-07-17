# Historical plan snapshot

## Groundcrew

Repository: `[admin frontend]`
Implementation workflow: use the `cb-work` skill or, if unavailable, the `core:go` skill.

Include this implementation ticket ID in the change body.

```bash

```

## Flake details

```json
{
  "repo": "[admin frontend]",
  "test": "Chat (redesign) — mobile chat from shift details on mobile renders as a stacked bottom sheet and can be ended",
  "file": "playwright/e2e/chat.spec.ts:241",
  "framework": "playwright",
  "isNewFlaky": false,
  "failures": [
    {
      "error": "Error: expect(page).toHaveURL(expected) failed\n\nExpected pattern: /chatWorkerId=/\nReceived string:  \"[external evidence reference]"\nTimeout: 4000ms\n\nCall log:\n  - Expect \"toHaveURL\" with timeout 4000ms\n    8 × unexpected value \"[external evidence reference]"\n\n\nCall Log:\n- Timeout 30000ms exceeded while waiting on the predicate",
      "stack": "Error: expect(page).toHaveURL(expected) failed\n\nExpected pattern: /chatWorkerId=/\nReceived string:  \"[external evidence reference]"\nTimeout: 4000ms\n\nCall log:\n  - Expect \"toHaveURL\" with timeout 4000ms\n    8 × unexpected value \"[external evidence reference]"\n\n\nCall Log:\n- Timeout 30000ms exceeded while waiting on the predicate\n    at clickUntilUrl (/opt/actions-runner/_work/[admin frontend]/[admin frontend]/playwright/e2e/chat.spec.ts:125:6)\n    at /opt/actions-runner/_work/[admin frontend]/[admin frontend]/playwright/e2e/chat.spec.ts:264:13\n    at WorkerMain._runTest (/opt/actions-runner/_work/[admin frontend]/[admin frontend]/node_modules/dd-trace/packages/datadog-instrumentations/src/playwright.js:1692:5)",
      "branch": "main",
      "pipeline": "[external evidence reference]",
      "commit": "40f5b4ebe9cc9d01c4ef6129a67e238087690723",
      "durationMs": 60384,
      "shard": "4/4",
      "timestamp": "2026-07-02T15:01:43Z"
    }
  ]
}
```

## Plan output

**Test ID:** `03dd965d45c5`

**Confidence:** 4/5. The artifact directly proves chat opened while `chatWorkerId` was absent. The missing link is exact identification of the competing history writer because current reporter output does not log URL writes.

**Failure surface:** Product/client state drift. The click was not a no-op and the backend chat-channel request succeeded; the failure is the client URL state not reflecting the open chat panel.

**Current main status:** Current `origin/main` still has the failing code path. The failing commit `40f5b4e` already included prior test-only hardening from change [reference redacted] and change [reference redacted]. No later relevant changes touched `playwright/e2e/chat.spec.ts`, `useChatPanel`, or `useShiftDeepLinking`.

**Symptom:** The Playwright test clicked the mobile Shift Details `Chat` button, then `clickUntilUrl(... /chatWorkerId=/ ...)` timed out for 30s. The final URL remained `/schedule?date=2026-07-03&view=day&shiftId=6a467d5e35d466dbaffea56b`.

**Root cause:** The shift-details chat modal and the URL are two sources of truth. In this occurrence the chat modal state and worker info were set, but `chatWorkerId` was missing from the URL. The earlier retry helper correctly avoids re-clicking once chat is visibly open, so it cannot repair this state drift.

**Evidence:**

- LLM report for run [reference redacted]`: attempt 1 failed; attempt 2 passed.
- Failure timeline: at ~28.6s, `Click getByRole('button', { name: 'Chat', exact: true })` completed; at ~29.07s, two `POST [external evidence reference] calls returned `201`with request body`{"facilityId":"6a467d5ca3fe1f1fd5fb40e5","agentId":"6a467d5936acbdb4f58f3d02"}`.
- Screenshot/page snapshot at failure show `Close chat`, `Chat messages`, and the disabled `Chat message` textbox mounted in the stacked bottom sheet.
- The URL assertion still saw no `chatWorkerId` for the entire retry budget.
- change [reference redacted] originally included a guarded URL reconciliation effect in `useChatPanel`, then removed it before integration. Its own notes say to re-add it if this exact flake recurs.

**Proposed fix:** Product fix in `src/appV2/redesign/Chat/hooks/useChatPanel.ts` plus focused hook tests.

1. Reintroduce the guarded reconciliation from change [reference redacted]'s removed commits:
   - import `useLocation` in `useChatPanel`;
   - track `chatOpenedShiftId` in a ref;
   - set that ref when chat opens from a click or deep link;
   - clear it when chat closes or when shift-change cleanup runs;
   - while chat is open and `chatWorkerInfo.workerId` exists, if `location.search` lacks the matching `chatWorkerId` and `chatOpenedShiftId.current === shiftId`, call `updateChatUrlParameter(chatWorkerInfo.workerId)`.
2. Keep the shift guard. Without it, a later shift change could resurrect `?shiftId=B&chatWorkerId=A`.
3. Add/restore `useChatPanel.test.tsx` coverage:
   - restores `chatWorkerId` when another URL writer drops it while chat is open on the same shift;
   - does not restore `chatWorkerId` after switching to another shift;
   - preserves existing close/toggle/deep-link behavior.
4. Do not add more Playwright retries/timeouts for this symptom; the app state is already visibly open, so extra clicking would mask URL/state drift.

**Observability to reach 5/5:** Add temporary or permanent frontend debug telemetry for query-param modal URL writes in this area:

- In `useChatPanel.updateChatUrlParameter`, log old URL, new URL, workerId, shiftId, and reason (`open`, `close`, `repair`) in non-PII-safe structured form.
- In `useShiftDeepLinking.updateUrl` / `buildShiftDeepLinkUrl`, log old URL, new URL, shiftId/inviteId, and whether `chatWorkerId` was preserved or removed.
- Ideally emit these as Datadog RUM actions or console debug gated for E2E so the Playwright LLM report captures the writer sequence next time.

**Sibling candidates:** Query-param-driven drawer/sheet hooks that maintain separate React modal state and URL params: `useShiftDeepLinking`, `useChatPanel`, My Professionals profile/chat URL state, MonthlyView selected slot/chat URL state.

**Validation plan:**

- `npm run test:v2 -- src/appV2/redesign/Chat/hooks/useChatPanel.test.tsx src/appV2/redesign/DailyView/hooks/useShiftDeepLinking.test.tsx`
- `npm run lint:fast -- src/appV2/redesign/Chat/hooks/useChatPanel.ts src/appV2/redesign/Chat/hooks/useChatPanel.test.tsx`
- If a deployed environment is available, rerun `playwright/e2e/chat.spec.ts` for the mobile project against staging/development.

**Open questions:** None blocking. A larger URL-as-source-of-truth modal model would be cleaner, but the guarded reconciliation is the smallest fix supported by this artifact.

**Residual risk:** If a different writer repeatedly strips `chatWorkerId` every render, reconciliation could loop or hide a deeper ownership bug. The shift guard and tests reduce stale-worker risk, and URL-write telemetry would make any remaining loop diagnosable.

## Prior related context

- `[ticket redacted]`: prior investigation.
- `[ticket redacted]`: duplicate prior investigation.
- `[ticket redacted]`: prior implementation for the same family of mobile chat URL flakes.
- change [reference redacted]: test-only hardening available after removing the exact product-side reconciliation that this recurrence now supports.
