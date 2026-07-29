# Mutation-Refresh Request Ordering

Last reviewed: 2026-07-29.

## Symptom signatures

- A mutation succeeds and switches the visible tab, but an earlier tab's rows reappear before the next action.
- The stale request is registered after the current-tab refresh even though the user initiated it earlier.
- Request-ID or latest-response guards accept the wrong result because debounce timing reversed request registration order.

## Mechanism

User-entered search and pagination may be intentionally debounced, but mutation-triggered refreshes are control-flow events with an immediate consistency contract. Sharing one debounced callback lets a pending refresh from the previous tab register after the mutation's current-tab fetch. The request-order guard then correctly accepts the latest registered request, but that request represents stale UI state.

This is distinct from query-driven interaction teardown. No open dialog or component-local state must remount; the wrong query is registered last and replaces the actionable list before the interaction begins.

## Affected repositories and surfaces

- `cbh-admin-frontend`: Team Members tab transitions after activation or deactivation.
- Query-backed lists that share a debounce between user input and mutation-driven invalidation or refresh.

## What fixed it

- Keep debounce at user-input boundaries such as search and pagination.
- Refresh the selected post-mutation state immediately, outside the shared debounce.
- Preserve request-ID or abort handling for genuinely concurrent responses.
- Add a regression that delays the prior tab's refresh and proves it cannot replace the current actionable row.

[cbh-admin-frontend#7684](https://github.com/ClipboardHealth/cbh-admin-frontend/pull/7684) removed the shared debounce from mutation-triggered Team Members refreshes while retaining it for search and pagination.

## What failed and why

- Correct latest-request handling could not help when debounce timing made the stale tab refresh the latest registered request.
- Retrying the row action accepted whichever list happened to win and did not restore deterministic post-mutation state.
- Increasing response or locator timeouts widened the window in which the delayed stale refresh could replace the row.
- Treating the failure as dialog teardown targeted interaction ownership even though the replacement happened before the action opened a dialog.

## Current status

Fixed for the Team Members activation/deactivation path in [STAFF-1911](https://linear.app/clipboardhealth/issue/STAFF-1911). Apply this entry only when delayed registration reverses the intended refresh order; late arrival alone belongs to the query client's normal stale-response controls.

## Evidence

- [STAFF-1911](https://linear.app/clipboardhealth/issue/STAFF-1911): cross-tab request timeline and shared-debounce causal terminus.
- [cbh-admin-frontend#7684](https://github.com/ClipboardHealth/cbh-admin-frontend/pull/7684): immediate mutation refresh and delayed-prior-tab regression coverage.
