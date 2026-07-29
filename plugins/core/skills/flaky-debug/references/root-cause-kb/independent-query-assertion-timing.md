# Independent-Query Assertion Timing

Last reviewed: 2026-07-29.

## Symptom signatures

- A component test waits for one query's spinner to disappear, then synchronously asserts data rendered by another query.
- A badge, tab name, or derived selection is briefly missing even though an adjacent list is already loaded.
- Equal mock delays usually pass, while delaying only the asserted data source reproduces the failure.

## Mechanism

The component owns independent asynchronous sources, but the test treats one source's loading state as proof that another source has settled and rendered. Completion ordering is not guaranteed even when both mocks use the same nominal delay.

The reliable signal is the behavior under test: wait for the badge, accessible name, or derived effect itself rather than for unrelated UI to stop loading.

## Affected repositories and surfaces

- `cbh-mobile-app`: Work With Friends component tests whose list and invitations count use separate React Query requests.
- Component tests with multiple MSW-backed queries or effects that render independently.

## What fixed it

- Await the asserted accessible state with `findBy*` or a focused `waitFor`.
- Fault-inject a slower response for the asserted source to prove that the old signal is unrelated and the replacement remains correct.
- Keep the assertion exact; change synchronization, not the expected behavior.

[cbh-mobile-app#12972](https://github.com/ClipboardHealth/cbh-mobile-app/pull/12972) changed the invitations badge assertion to wait for `Invitations 1` directly and changed the sibling auto-selection test to wait for the exact selection effect.

## What failed and why

- Waiting for the Friends list spinner observed only `useGetFriendsList`; it said nothing about `useGetInboundFriendsRequests`.
- Synchronous `getByRole` converted a valid intermediate render into an immediate failure.
- Equal 50 ms MSW delays hid the race in most local runs because they did not establish a completion-order contract.
- Longer global timeouts would not help a synchronous assertion that never retries.

## Current status

Fixed for the two known Work With Friends assertions. Treat future cases as this mechanism only when the completion signal and asserted state have independent owners. Shared-query renders or user-event/fake-timer failures belong to their own entries.

## Evidence

- [STAFF-1910](https://linear.app/clipboardhealth/issue/STAFF-1910): independent-query causal chain and sibling search.
- [cbh-mobile-app#12972](https://github.com/ClipboardHealth/cbh-mobile-app/pull/12972): direct behavior waits plus delayed-inbound MSW fault injection.
