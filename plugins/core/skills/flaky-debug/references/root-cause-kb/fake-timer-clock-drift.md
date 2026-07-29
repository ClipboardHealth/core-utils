# Fake-Timer Clock Drift

Last reviewed: 2026-07-29.

## Symptom signatures

- A one-minute timestamp drift changes a two-decimal service-test duration or payment assertion, such as `0.5` versus `0.49`, `3.5` versus `3.51`, or `2.5` versus `2.49` hours.
- The first Jest attempt fails and the retry passes with the same production calculation.
- The test uses `jest.useFakeTimers({ advanceTimers: true })`, resets system time, then awaits an HTTP or service workflow that later samples `new Date()`.

## Mechanism

Auto-advancing fake timers move the mocked wall clock while asynchronous work runs. The test sets an intended business timestamp before a request, but production code reads `new Date()` later after the fake clock has advanced. Minute-normalized duration and payment logic correctly computes from the timestamp it receives, so the nondeterminism belongs to test-controlled time.

This differs from user-event timer deadlocks and post-teardown work: the clock progresses, but it no longer represents the scenario's fixed instant.

## Affected repositories and surfaces

- `clipboard-health`: service tests for sent-home, cancellation, timekeeping, and payment boundaries.
- Any async test that combines auto-advancing fake timers with production code that samples wall-clock time after an await.

## What fixed it

- Choose deterministic, boundary-safe scenario timestamps such as a fixed future hour.
- Keep the business clock pinned across the asynchronous request when elapsed timer progression is not part of the scenario.
- Assert the intended and persisted timestamps before asserting derived duration or payment values.
- Restore timers after the test and retain exact timestamp diagnostics on failure.

[clipboard-health#27032](https://github.com/ClipboardHealth/clipboard-health/pull/27032) anchored the back-to-back bonus scenario at a deterministic hour and recorded the relevant time values for the derived assertion.

## What failed and why

- Resetting system time immediately before the request was insufficient while `advanceTimers: true` remained active.
- Loosening the monetary assertion would hide a changed timestamp and weaken coverage of the production calculation.
- Increasing the test timeout gives the fake clock more opportunity to move and does not establish a stable business instant.
- The existing user-event/fake-timer entry describes event scheduling and teardown, not wall-clock drift through an async service boundary.

## Current status

Fixed for the back-to-back bonus adjustment service test in [STAFF-1862](https://linear.app/clipboardhealth/issue/STAFF-1862). Search sibling time-sensitive service tests when the same auto-advance pattern controls timestamps used by production calculations.

## Evidence

- [STAFF-1862](https://linear.app/clipboardhealth/issue/STAFF-1862): minute-boundary diagnosis and deterministic test-data plan.
- [clipboard-health#27032](https://github.com/ClipboardHealth/clipboard-health/pull/27032): fixed-hour scenario boundary, timestamp diagnostics, and focused repeated validation.
