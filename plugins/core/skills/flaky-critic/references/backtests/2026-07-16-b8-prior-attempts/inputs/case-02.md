# Historical plan snapshot

## Flake Details

```json
{
  "repo": "[backend monolith]",
  "test": "PUT /api/agentProfile/stage when worker is deactivated should route suspension through workplace-shift-unassignment when revamp flag is on for regular worker",
  "file": "src/service-test/endpoints/api/agentProfile/stage/put.test.ts:1752",
  "framework": "jest",
  "isNewFlaky": false,
  "failures": [
    {
      "error": "expected workplace-shift-unassignment-digest recipient trigger_data shouldSendImmediately=false, received shouldSendImmediately=true with digestSendAt=2026-06-19T23:00:00.000Z",
      "stack": "at toStrictEqual (/opt/actions-runner/_work/clipboard-health/clipboard-health/src/service-test/endpoints/api/agentProfile/stage/put.test.ts:1894:31)",
      "branch": "gh-readonly-queue/main/change-[reference redacted]-57af82a5a209cb71849ca6ecbe939a4f0b0f1215",
      "pipeline": "[external evidence reference]",
      "commit": "cf1bb0ac5c2e40c60d6285f716f708c7d011c3d4",
      "durationMs": 2471,
      "shard": "8/12",
      "timestamp": "2026-06-18T23:00:23Z"
    },
    {
      "error": "same assertion diff; digestSendAt=2026-06-19T23:00:00.000Z and shouldSendImmediately=true",
      "pipeline": "[external evidence reference]",
      "commit": "cf1bb0ac5c2e40c60d6285f716f708c7d011c3d4",
      "durationMs": 2230,
      "shard": "8/12",
      "timestamp": "2026-06-18T23:00:20Z"
    },
    {
      "error": "same assertion diff; digestSendAt=2026-06-19T23:00:00.000Z and shouldSendImmediately=true",
      "pipeline": "[external evidence reference]",
      "commit": "cf1bb0ac5c2e40c60d6285f716f708c7d011c3d4",
      "durationMs": 2339,
      "shard": "8/12",
      "timestamp": "2026-06-18T23:00:18Z"
    }
  ]
}
```

Related investigation: [ticket redacted]

## Plan Output

**Test ID:** ace0c5711269 / [ticket redacted]

**Confidence:** 5/5. The CI failure timestamp, assertion diff, and current code path line up exactly: the test’s earliest shift can land just before the next digest send time, and `shouldSendImmediately` is designed to return `true` in that case.

**Failure surface:** Test setup/data. The service test uses time-sensitive fixture data that does not always satisfy the assertion it makes about digest batching.

**Current main status:** The code path still exists on current `origin/main` (`82e3b188bb`). Recent commit `77276bb1f8` / change [reference redacted] touched this test for push-link data but did not change the `+24h` earliest shift or the `shouldSendImmediately: false` assertion. `gh pr list` found no open `flaky-test-fix` PRs matching the test file, `workplace-shift-unassignment-digest`, or `shouldSendImmediately`.

**Symptom:** The test expects the Knock digest recipient trigger data to contain `shouldSendImmediately: false`, but CI received `shouldSendImmediately: true` with `digestSendAt: "2026-06-19T23:00:00.000Z"`.

**Root cause:** In `src/service-test/endpoints/api/agentProfile/stage/put.test.ts`, the test creates the earliest shift with `addHours(TIME_NOW, 24)`, where `TIME_NOW` is captured at module import. The notification path computes `digestSendAt` later from real `new Date()` in `RecipientResolverService.computeDigestSendAt`, then `ShiftUnassignmentNotificationService` calls `shouldSendImmediately({ digestSendAt, shiftStart: earliestShiftStart })`. Around the 16:00 America/Los_Angeles digest boundary, `TIME_NOW` can be just before 16:00 PT while notification execution is just after 16:00 PT. That makes the next digest `tomorrow 16:00 PT` (`2026-06-19T23:00:00Z` in the failing PDT run), while the test shift is `TIME_NOW + 24h`, a few seconds earlier than that. The production condition `!isBefore(new Date(digestSendAt), shiftStart)` is then true, so the immediate send flag is correct and the test expectation is brittle.

**Evidence:**

- Failure artifact: all three CI failures happened at `2026-06-18T23:00:18Z` through `23:00:23Z`, which is exactly 16:00 PT during PDT.
- Failure diff: received `digestSendAt: "2026-06-19T23:00:00.000Z"` and `shouldSendImmediately: true`.
- Test code: `src/service-test/endpoints/api/agentProfile/stage/put.test.ts:1776` creates the earliest shift at `addHours(TIME_NOW, 24)`, and line 1854 expects `shouldSendImmediately: false`.
- Production code: `src/modules/facility-notifications/logic/recipient-resolver.service.ts` computes the next digest from `new Date()`; `src/modules/facility-notifications/logic/batching.utils.ts` returns true when the digest send time is not before the shift start; `src/modules/facility-notifications/logic/shift-unassignment-notification.service.ts` uses the earliest sorted shift for that decision.
- Deterministic boundary calculation: if import-time `TIME_NOW` is `2026-06-18T22:59:50Z` and notification execution is `2026-06-18T23:00:23Z`, the shift starts `2026-06-19T22:59:50Z`; the next digest is `2026-06-19T23:00:00Z`; therefore `digestSendAt >= shiftStart` and `shouldSendImmediately` is true.

**Proposed fix:** Test harness/data fix only.

Update `src/service-test/endpoints/api/agentProfile/stage/put.test.ts` in the “when worker is deactivated” test so the shifts used for the digest-batching assertion are far enough in the future for the next digest window to close before the earliest shift. Prefer matching nearby tests by using the existing `getShiftStartTimeAfterThreeDaysInUtc()` / `getShiftEndTimeAfterThreeDaysInUtc()` helpers for the first shift, derive the second shift from those values, and reuse the same variables in `expectedData` instead of recomputing from `TIME_NOW`.

Suggested shape:

```ts
const firstShiftStart = getShiftStartTimeAfterThreeDaysInUtc();
const firstShiftEnd = getShiftEndTimeAfterThreeDaysInUtc();
const secondShiftStart = addHours(new Date(firstShiftStart), 24).toISOString();
const secondShiftEnd = addHours(new Date(firstShiftEnd), 24).toISOString();
```

Then create the two shifts with those values and assert `expectedData.shifts` with `firstShiftStart` and `secondShiftStart`. Update the nearby comment from “24h out” to “3 days out”. Do not change production code: the received `true` value is correct when the digest send time is after the shift start.

**Observability to reach 5/5:** N/A -- confidence is 5/5.

**Sibling candidates:** No obvious sibling requiring the same change. A repo search found this is the only facility-notification digest assertion in the inspected service-test set that combines `shouldSendImmediately: false` with `addHours(TIME_NOW, 24)`. Nearby digest tests already use 3-day shifts or explicitly expect `true` for urgent/near-term shifts.

**Validation plan:**

1. Start service-test dependencies:

```sh
npx tsx src/service-test/service-test-docker.ts up
```

2. Run the targeted service test:

```sh
node --run service-test:dir -- src/service-test/endpoints/api/agentProfile/stage/put.test.ts --testNamePattern="should route suspension through workplace-shift-unassignment when revamp flag is on for regular worker"
```

3. If the implementation touches only this test, no broader suite should be necessary. If shared helpers are changed, also run affected facility-notification digest tests.

**Open questions:** None.

**Residual risk:** This fixes the known boundary flake for this test. Other tests that assert digest batching with fixture times close to the next digest boundary could still be flaky, but the searched sibling candidates already use farther-out shifts or assert the immediate path intentionally.

## Implementation Instructions

- Include this implementation ticket ID in the change body.

```sh

```

- Implement the plan in this ticket using the `cb-work` skill, or if unavailable, the `core:go` skill.
- Label the change `flaky-test-fix`.
