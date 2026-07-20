# Query-Driven List Dialog Teardown

Last reviewed: 2026-07-20.

## Symptom signatures

- Playwright reports `element is not stable` followed by `element was detached from the DOM`.
- A dialog or sheet opens, then its title/content disappears or never becomes stably visible.
- The failure moves between actions on different rows of the same query-backed list.
- A mutation succeeds, but the confirmation interaction or post-success assertion loses the overlay.
- An already-open menu or other interaction surface detaches when a delayed
  provider token changes the authenticated application's React topology.
- A selected file or other route-local state resets immediately after a late provider token becomes ready.
- A valid restored form draft remains visible after a remount, but its submit action is disabled because the restored values became the new pristine baseline.
- A qualification picker or inline posting form opens, then disappears when its query-backed card is reconciled or replaced.
- A disclosure changes from open to closed without a second user action, unmounting the nested content or action a caller was about to use.
- Known families: `33deef731a10` and `2d93cd67b48a`.

## Mechanism

The overlay is owned by a component rendered beneath a mapped query result, such as `cases.map(...<CaseCard>)` or `visits.map(...<VisitCard>)`. Background, focus, interval, or mutation-triggered query refreshes reconcile, reorder, or remove the row while the overlay is open. Because the dialog or sheet lifecycle is tied to that row, the overlay remounts or unmounts during interaction.

The decisive test is structural: if deleting or replacing the launching row also destroys the open overlay, the product has this mechanism even when the visible failure is a locator timeout.

The same structural mechanism can occur above the list. A token-dependent
provider wrapper that returns raw application children before bootstrap and
wraps those children after bootstrap replaces the authenticated route subtree.
That higher ancestor remount destroys menus, drawers, and form state even after
list-owned dialogs have been hoisted into a stable host.

The same ownership test applies to non-overlay interaction state. If replacing a query-backed card resets its disclosure, selected qualification, or derived eligibility even when field values rehydrate, the interaction contract remains below a replaceable ancestor even when no dialog is open.

## Affected repositories and surfaces

- `cbh-admin-frontend`: Home Health case and visit action dialogs and case-visit disclosure; Team Members add/edit forms; Daily View qualification pickers and inline posting forms; other query-driven list dialogs found by the repository sweep; authenticated route state beneath the Knock bootstrap boundary.
- `cbh-mobile-app`: placement sign-on-bonus and badge-history sheets; workplace-review comment and reply action sheets; document-upload state beneath the Knock bootstrap boundary.
- Any React surface that owns interaction state or eligibility beneath a query-backed `.map()` descendant or another replaceable ancestor.

## What fixed it

- Hoist overlay ownership above the mapped list into one stable, entity-keyed host. Rows become trigger-only and pass entity identity to the host.
- Add regression coverage that opens the overlay, removes or refreshes the launching row, and proves the overlay survives.
- Add an architecture guard for direct dialog/modal/sheet JSX inside `.map()` callbacks, then perform a semantic sweep for indirect descendants the syntax guard cannot see.
- Split oversized sequential E2E flows after the product fix so one mechanism does not surface as many indistinguishable steps.

The durable Home Health fix is [cbh-admin-frontend#7574](https://github.com/ClipboardHealth/cbh-admin-frontend/pull/7574). Repository-wide follow-ups landed in [cbh-admin-frontend#7569](https://github.com/ClipboardHealth/cbh-admin-frontend/pull/7569), [cbh-mobile-app#12857](https://github.com/ClipboardHealth/cbh-mobile-app/pull/12857), and [cbh-mobile-app#12860](https://github.com/ClipboardHealth/cbh-mobile-app/pull/12860).

[cbh-admin-frontend#7608](https://github.com/ClipboardHealth/cbh-admin-frontend/pull/7608) fixed the provider-topology variant. It keeps the authenticated application children at a stable React position and conditionally mounts only the Knock guide consumers beneath the token-dependent providers. Component coverage proved that delayed and immediate tokens preserve the application mount and local state; a rate-negotiation E2E fault injection holds the Knock-token response across an open interaction and requires exactly one end-negotiation request.

- [cbh-mobile-app#12935](https://github.com/ClipboardHealth/cbh-mobile-app/pull/12935) applied the stable-application-branch pattern to the mobile Knock wrapper and bridges only ready SDK contexts to consumers.
- [cbh-admin-frontend#7636](https://github.com/ClipboardHealth/cbh-admin-frontend/pull/7636) moved Daily View picker and selected-qualification state into the stable `PostingFormProvider`.
- [cbh-admin-frontend#7644](https://github.com/ClipboardHealth/cbh-admin-frontend/pull/7644) completed the Team Members recurrence by treating a schema-valid restored add-member draft as submit-eligible.
- [cbh-admin-frontend#7654](https://github.com/ClipboardHealth/cbh-admin-frontend/pull/7654) mitigated the remaining Home Health disclosure race at the harness boundary by re-establishing the expected nested surface before a safe pre-confirmation action and never retrying the mutation. It did not lift disclosure ownership out of the replaceable card.

## What failed and why

- Repeated `toPass` blocks, response waits, locator retries, failure trackers, and expanded timeouts hardened whichever Home Health step failed most recently but left overlay ownership unchanged. The family recurred across [STAFF-1329](https://linear.app/clipboardhealth/issue/STAFF-1329), [STAFF-1369](https://linear.app/clipboardhealth/issue/STAFF-1369), [STAFF-1495](https://linear.app/clipboardhealth/issue/STAFF-1495), [STAFF-1554](https://linear.app/clipboardhealth/issue/STAFF-1554), [STAFF-1582](https://linear.app/clipboardhealth/issue/STAFF-1582), [STAFF-1673](https://linear.app/clipboardhealth/issue/STAFF-1673), and [STAFF-1685](https://linear.app/clipboardhealth/issue/STAFF-1685).
- Preserving modal state across a remount did not preserve the DOM node Playwright or a user was interacting with. The Team Members recurrence from [STAFF-1422](https://linear.app/clipboardhealth/issue/STAFF-1422) to [STAFF-1459](https://linear.app/clipboardhealth/issue/STAFF-1459) is the precedent.
- Preserving Team Members dialog visibility and field values was still partial: React Hook Form accepted the restored values as pristine defaults, so a complete valid draft survived while the submit button remained disabled. [STAFF-1863](https://linear.app/clipboardhealth/issue/STAFF-1863) established that remount recovery must preserve or re-derive eligibility, not only presentation state.
- Keeping Daily View posting state inside `NewRolePostingCard` let query/context reconciliation discard the open picker and selected qualification. A later response wait or action retry could not reconstruct that state; ownership had to move to the stable posting-form provider.
- Stronger document-upload handoff and transition waits correctly committed and observed the selected file, but a later Knock provider-topology transition still recreated `FileUploaderProvider` with an empty queue. Local state hardening below the replacing ancestor could not preserve the route subtree.
- A one-shot `Show Case Visits` click followed only by a `Hide Case Visits` assertion accepted disclosure state that disappeared about 50 ms later. Dialog hoisting did not protect the separate case-card expansion state before or after the dialog lifecycle, and retrying a destructive visit mutation would not preserve the scenario.
- Pausing backing-list observers and deferring invalidations in [cbh-admin-frontend#7559](https://github.com/ClipboardHealth/cbh-admin-frontend/pull/7559) reduced the race window but was explicitly an interim mitigation: another ancestor update could still remove the row. The hoisted host later deleted that workaround.
- Hoisting Home Health dialogs in [cbh-admin-frontend#7574](https://github.com/ClipboardHealth/cbh-admin-frontend/pull/7574) correctly removed their query-row ownership, but it could not preserve the earlier action menu or the route when the delayed Knock token replaced a higher provider boundary. [STAFF-1856](https://linear.app/clipboardhealth/issue/STAFF-1856) established that failed scope with route lifecycle telemetry and immediate post-remount Knock requests.
- Splitting the E2E test alone would reduce blast radius and improve fingerprints, but it would not fix the user-facing overlay teardown.

## Current status

Fixed for the known query-row and replaceable-owner surfaces covered by [STAFF-1789](https://linear.app/clipboardhealth/issue/STAFF-1789), [STAFF-1790](https://linear.app/clipboardhealth/issue/STAFF-1790), [STAFF-1796](https://linear.app/clipboardhealth/issue/STAFF-1796), [STAFF-1797](https://linear.app/clipboardhealth/issue/STAFF-1797), [STAFF-1806](https://linear.app/clipboardhealth/issue/STAFF-1806), [STAFF-1863](https://linear.app/clipboardhealth/issue/STAFF-1863), and [STAFF-1875](https://linear.app/clipboardhealth/issue/STAFF-1875). The Knock provider-topology variant is fixed in both frontend repositories by [cbh-admin-frontend#7608](https://github.com/ClipboardHealth/cbh-admin-frontend/pull/7608) and [cbh-mobile-app#12935](https://github.com/ClipboardHealth/cbh-mobile-app/pull/12935). The known Home Health disclosure paths are bounded at the harness layer by [cbh-admin-frontend#7654](https://github.com/ClipboardHealth/cbh-admin-frontend/pull/7654); if users continue to see the disclosure collapse, lift that state above the replaceable card. Treat future instances as the same mechanism when interaction ownership remains below any replaceable ancestor; make the ancestor composition stable or move interaction ownership above that boundary rather than adding per-test waits.

## Evidence

- [STAFF-1789](https://linear.app/clipboardhealth/issue/STAFF-1789): mitigation and fault-injection proof for Home Health list refreshes.
- [STAFF-1790](https://linear.app/clipboardhealth/issue/STAFF-1790): durable host design and E2E decomposition.
- [cbh-admin-frontend#7559](https://github.com/ClipboardHealth/cbh-admin-frontend/pull/7559): refetch guard, with residual ownership risk documented.
- [cbh-admin-frontend#7574](https://github.com/ClipboardHealth/cbh-admin-frontend/pull/7574): hoisted host and deletion of the temporary guard.
- [cbh-mobile-app#12857](https://github.com/ClipboardHealth/cbh-mobile-app/pull/12857): mobile sheet hoists and architecture guard.
- [cbh-mobile-app#12860](https://github.com/ClipboardHealth/cbh-mobile-app/pull/12860): indirect workplace-review descendants hoisted after the syntactic guard could not detect them.
- [STAFF-1846](https://linear.app/clipboardhealth/issue/STAFF-1846): source deep dive and prior-attempt dossier for the provider-topology fix.
- [STAFF-1856](https://linear.app/clipboardhealth/issue/STAFF-1856): provider-topology recurrence, route lifecycle telemetry, and the failed scope of the dialog-only hoist.
- [cbh-admin-frontend#7608](https://github.com/ClipboardHealth/cbh-admin-frontend/pull/7608): stable application composition plus delayed-token and fault-injection regression coverage.
- [STAFF-1872](https://linear.app/clipboardhealth/issue/STAFF-1872) and [cbh-mobile-app#12935](https://github.com/ClipboardHealth/cbh-mobile-app/pull/12935): mobile document-upload state reset and the stable mobile provider composition.
- [STAFF-1875](https://linear.app/clipboardhealth/issue/STAFF-1875) and [cbh-admin-frontend#7636](https://github.com/ClipboardHealth/cbh-admin-frontend/pull/7636): Daily View picker and posting-form state hoisted above replaceable cards with remount regressions.
- [STAFF-1863](https://linear.app/clipboardhealth/issue/STAFF-1863) and [cbh-admin-frontend#7644](https://github.com/ClipboardHealth/cbh-admin-frontend/pull/7644): Team Members restored-draft eligibility recurrence and completed fix.
- [STAFF-1859](https://linear.app/clipboardhealth/issue/STAFF-1859) and [cbh-admin-frontend#7654](https://github.com/ClipboardHealth/cbh-admin-frontend/pull/7654): Home Health case-visit disclosure remount, expected-surface recovery, and destructive-boundary diagnostics.
