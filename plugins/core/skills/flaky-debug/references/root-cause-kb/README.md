# Flaky Root-Cause Knowledge Base

Use this index to match a failure signature to a previously diagnosed mechanism before opening a new implementation path. Entries are indexed by mechanism, never by test. A test name or file is evidence for a mechanism, not the identity of an entry.

When adding an entry, keep the same sections used by the seeded entries:

1. Symptom signatures
2. Mechanism
3. Affected repositories and surfaces
4. What fixed it
5. What failed and why
6. Current status
7. Evidence

## Symptom index

| Symptom signature or fingerprint                                                                                                             | Mechanism cue                                                                                     | Entry                                                                                     |
| -------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------- |
| `element was detached from the DOM`, `element is not stable`, open dialog or sheet disappears during a mutation/refetch                      | Overlay is rendered below a query-driven mapped row that is reconciled or removed                 | [Query-driven list dialog teardown](./query-driven-list-dialog-teardown.md)               |
| Dialog title or sheet content never becomes stably visible after it opened                                                                   | The owning list item remounted while the overlay was open                                         | [Query-driven list dialog teardown](./query-driven-list-dialog-teardown.md)               |
| Open menu or form detaches as a delayed provider token arrives; route lifecycle shows a parent remount                                       | A token-dependent provider topology replaced the authenticated application subtree                | [Query-driven list dialog teardown](./query-driven-list-dialog-teardown.md)               |
| A selected file or other route-local state resets immediately after a late provider token becomes ready                                      | Conditional providers changed React ancestry and remounted the authenticated route subtree        | [Query-driven list dialog teardown](./query-driven-list-dialog-teardown.md)               |
| A valid restored form survives a remount, but its submit action remains disabled as pristine                                                 | The remounted form reclassified restored values as defaults without re-deriving eligibility       | [Query-driven list dialog teardown](./query-driven-list-dialog-teardown.md)               |
| A qualification picker or inline posting form opens, then disappears when its query-backed card is replaced                                  | Picker and selected-qualification state are owned by the replaceable card                         | [Query-driven list dialog teardown](./query-driven-list-dialog-teardown.md)               |
| A disclosure briefly changes from `Show` to `Hide`, then closes without a second user action                                                 | Component-local disclosure state reset when its query-driven owner remounted                      | [Query-driven list dialog teardown](./query-driven-list-dialog-teardown.md)               |
| Fingerprints `33deef731a10`, `2d93cd67b48a`                                                                                                  | Home Health instance of query-driven overlay ownership                                            | [Query-driven list dialog teardown](./query-driven-list-dialog-teardown.md)               |
| `Cognito user '<email>' does not exist`, `UserNotFoundException` immediately after a successful user-create response                         | Consumer is rediscovering an opaque Cognito username through an eventually consistent email alias | [Cognito email-alias eventual consistency](./cognito-email-alias-eventual-consistency.md) |
| Email-based Cognito Admin mutation fails while the same user exists under `from_admin_<uuid>`                                                | Strong username identity was discarded at the producer boundary                                   | [Cognito email-alias eventual consistency](./cognito-email-alias-eventual-consistency.md) |
| `TooManyRequestsException`, `MAKE_TEST_TOKEN: Too many requests`, clustered Cognito setup `401`/`403` across shards                          | Parallel workers exceed the shared Cognito Admin API budget                                       | [Cognito API throttling](./cognito-api-throttling.md)                                     |
| `AdminUpdateUserAttributes` throttle storm, especially from token setup                                                                      | Stateful Cognito write is on a per-test or per-token hot path                                     | [Cognito API throttling](./cognito-api-throttling.md)                                     |
| Fresh entity creation succeeds, then consuming UI/API reports `Invalid workplace`, `Worker <id> not found`, opaque `500`, or readiness `422` | CDC/read-model ingestion has not reached the consuming path                                       | [CDC and read-model readiness](./cdc-read-model-readiness.md)                             |
| Fixed CDC sleep passes usually but fails under load                                                                                          | Time delay is standing in for a missing readiness signal                                          | [CDC and read-model readiness](./cdc-read-model-readiness.md)                             |
| A wrapped `Worker <id> not found` exposes its status but not its response message, then an outer retry creates another worker                | Wrapper-unaware classification bypassed the same-entity readiness poll and reset the CDC clock    | [CDC and read-model readiness](./cdc-read-model-readiness.md)                             |
| `ChunkLoadError`, `Failed to fetch dynamically imported module`, lazy route never renders, downstream locator timeout after JS asset `5xx`   | A lazy import became permanently rejected after a transient asset failure                         | [Lazy-chunk load recovery](./lazy-chunk-load-recovery.md)                                 |
| Many test-specific lazy-route fix PRs for different pages in the same incident                                                               | Shared product loader lacks centralized recovery                                                  | [Lazy-chunk load recovery](./lazy-chunk-load-recovery.md)                                 |
| Hashed JS/CSS asset returns CloudFront `503 LimitExceeded`; retries replay the same error for about 10 seconds                               | CloudFront error caching amplifies a short S3-origin burst                                        | [CDN 503 amplification](./cdn-503-amplification.md)                                       |
| Cold-cache deploy stampede followed by widespread static-asset failures                                                                      | Hashed assets lack immutable caching and edge errors are pinned                                   | [CDN 503 amplification](./cdn-503-amplification.md)                                       |
| `LaunchDarkly initialization failed after N attempts`, app/service fails before tests start                                                  | Feature-flag bootstrap is a hard startup dependency                                               | [Feature-flag and third-party bootstrap](./feature-flag-and-third-party-bootstrap.md)     |
| Popup/new tab bypasses LaunchDarkly, analytics, monitoring, Maps, or other mocks                                                             | Mocks were installed on one page instead of the browser context                                   | [Feature-flag and third-party bootstrap](./feature-flag-and-third-party-bootstrap.md)     |
| Stripe/Maps/vendor SDK request fails, hangs, or escapes mocks before readiness UI renders                                                    | Third-party bootstrap is nondeterministic or isolated at the wrong browser scope                  | [Feature-flag and third-party bootstrap](./feature-flag-and-third-party-bootstrap.md)     |
| Component test hangs after `userEvent.click/type`, especially with fake timers                                                               | Async `user-event` work is not awaited or timers cannot advance                                   | [user-event and fake-timer timing](./user-event-and-fake-timer-timing.md)                 |
| Test passes but later throws `window is not defined`, act warning, or post-teardown timer error                                              | Pending debounced/async work escaped teardown                                                     | [user-event and fake-timer timing](./user-event-and-fake-timer-timing.md)                 |
| Failures appeared during `@testing-library/user-event` v13 to v14 or Vitest migration                                                        | Previously synchronous assumptions became explicit promises and timer integration requirements    | [user-event and fake-timer timing](./user-event-and-fake-timer-timing.md)                 |

## Lookup discipline

- Match the mechanism using the failure surface and causal evidence, not only a shared error string.
- Read the candidate entry's failed-attempt section before proposing a fix.
- If the evidence contradicts the entry, continue the investigation and add a new mechanism only when the causal terminus is genuinely different.
- Update an existing entry when a new repository or test exposes the same mechanism.

## Demonstrated cycle

The [workplace-review sheet dry run](./dry-run-workplace-review-sheet.md) demonstrates one complete, write-free cycle: a diagnosis matches symptom signatures to an entry, the plan cites the mechanism and failed-fix history, and the merged fix close-out identifies the exact entry sections updated.
