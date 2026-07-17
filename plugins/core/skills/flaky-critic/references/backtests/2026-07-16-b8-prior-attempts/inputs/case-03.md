# Historical plan snapshot

## Groundcrew

Repository: [admin frontend]
Implementation workflow: use the `core:cb-work`/`cb-work` skill when available. If that skill is unavailable, follow this repo's [AGENTS.md/CLAUDE.md]([external evidence reference]) implementation workflow and run the documented verification.

## Task

A deep dive on the chronic Home Health fullLifecycle flake (fingerprint family 33deef731a10; [ticket family redacted] — recurred after 6+ times) diagnosed the root cause at 4/5 confidence:

Every HH action dialog (`CaseClosureDialog`, `CancelVisitDialog`, etc.) renders as a React descendant of a react-query list item (`CaseCard` from `useAgencyCases`, `VisitCard` from `useCaseVisits`). Those lists are invalidated by the dialogs' own mutations (`useUpdateVisit.ts:66`, `useUpdateCase.ts:44-56`) and also refetch on a 5-min `staleTime` / 10-min `refetchInterval` / window-focus cadence. When a refetch resolves while a dialog is open, the list item reconciles ("element is not stable") or drops out of the filtered result ("element was detached from the DOM") — exactly the signatures in [ticket redacted] (detached Close button at `submitCloseCase`) and [ticket redacted] (flapping cancel-dialog title).

This ticket is the phase-1 mitigation: while any HH action dialog is open, suppress `refetchOnWindowFocus`/`refetchInterval` on the backing list queries and defer query invalidation until the dialog closes (flush on close). Do NOT add waits, retries, or locator changes to the specs — the 12 prior stabilization commits did that and the flake recurred each time (rubric B4).

## Acceptance Criteria

- [ ] While an HH dialog is open, the backing list queries neither interval/focus-refetch nor process invalidations; deferred invalidations flush on dialog close.
- [ ] Fault-injection validation: force a list refetch while a dialog is open — before the change this reproduces the detached/unstable signature, after it does not. If the environment cannot run e2e against staging, cover with a component-level test that simulates refetch-while-open.
- [ ] Existing HH unit/component tests and lint/typecheck pass.

## Notes

The durable fix (hoisting dialogs into a stable dialog host above `cases.map`) and fullLifecycle spec decomposition are a separate ticket. Full deep-dive document: ask Rocky for `deep-dives/hh-full-lifecycle.md`.
