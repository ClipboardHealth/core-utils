# user-event and Fake-Timer Component-Test Timing

Last reviewed: 2026-07-16.

## Symptom signatures

- Component test hangs or times out after `userEvent.click`, `type`, `clear`, or keyboard input.
- Assertions run before event-driven state updates complete.
- Fake-timer suites stop progressing because `user-event` scheduled work cannot advance.
- A test passes, then emits an act warning, unhandled rejection, or `window is not defined` after jsdom teardown.
- Failures appear after a `user-event`, Vitest, React, or Testing Library upgrade exposes previously implicit timing.

## Mechanism

`@testing-library/user-event` v14 APIs are asynchronous and model multiple browser events. Tests written with v13-style synchronous calls can assert or tear down before those events finish. When fake timers are active, the configured `user-event` instance must be able to advance the runner's timers; otherwise its internal delays and the component's scheduled work deadlock.

A related teardown class occurs when debounced component-library timers remain pending after the DOM environment is destroyed. Timer ownership and cleanup, not a larger timeout, determine correctness.

## Affected repositories and surfaces

- `cbh-mobile-app`: Jest and Vitest component tests migrated from `user-event` v13.5 to v14.
- `cbh-admin-frontend`: component-library debounces and fake-timer teardown patterns.
- Any component test mixing `user-event`, fake timers, MSW, debounced UI libraries, animations, or scheduled state updates.

## What fixed it

- Upgrade to `user-event` v14 and await every interaction.
- Prefer one `const user = userEvent.setup(...)` instance per test.
- In fake-timer suites, configure `advanceTimers` with the active runner, such as `vi.advanceTimersByTime` or `jest.advanceTimersByTime`.
- Flush only the work the scenario owns, restore real timers in `afterEach`, and keep cleanup before jsdom teardown.
- Enforce `testing-library/await-async-events` so new interactions that are not awaited fail lint.

The repository-wide migration landed in [cbh-mobile-app#10310](https://github.com/ClipboardHealth/cbh-mobile-app/pull/10310).

## What failed and why

- [cbh-mobile-app#5565](https://github.com/ClipboardHealth/cbh-mobile-app/pull/5565) attempted a broad `fireEvent` to `userEvent` lint conversion before the full async/timer migration. It was closed with unresolved lint and test failures; changing the API name alone did not establish correct timing.
- Static `userEvent.*` calls mixed with `userEvent.setup()` left inconsistent isolation and made missing awaits easy to reintroduce.
- Adding per-test or global timeout increases, including the Vitest 4 migration's timeout accommodation in [cbh-mobile-app#11947](https://github.com/ClipboardHealth/cbh-mobile-app/pull/11947), can make slow suites pass but does not fix a deadlocked fake timer or interaction that was not awaited.
- Fake timers alone are not sufficient. Without `advanceTimers`, `user-event` may wait forever; without teardown flushing/restoration, callbacks may fire after jsdom is gone.
- The closed [cbh-admin-frontend#6699](https://github.com/ClipboardHealth/cbh-admin-frontend/pull/6699) correctly identified a pending MUI debounce but never landed, illustrating that a plausible timer diagnosis still needs a maintained, merged cleanup pattern.

## Current status

The mobile v14 migration and lint enforcement are merged. Treat new component-test timing failures as one of three explicit subtypes before editing: interaction not awaited, fake-timer integration, or pending teardown work. Do not default to timeout inflation.

## Evidence

- [cbh-mobile-app#10310](https://github.com/ClipboardHealth/cbh-mobile-app/pull/10310): v13.5 to v14 migration, approximately 1,300 awaited calls, fake-timer `advanceTimers` setup, and lint enforcement.
- [cbh-mobile-app#5565](https://github.com/ClipboardHealth/cbh-mobile-app/pull/5565): incomplete earlier mechanical conversion.
- [cbh-mobile-app#11947](https://github.com/ClipboardHealth/cbh-mobile-app/pull/11947): Vitest 4 migration showing remaining user-event/fake-timer/MSW timing pressure.
- [cbh-admin-frontend#6699](https://github.com/ClipboardHealth/cbh-admin-frontend/pull/6699): post-teardown MUI debounce signature and proposed timer cleanup.
