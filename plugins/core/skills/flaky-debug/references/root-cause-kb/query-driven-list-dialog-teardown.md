# Query-Driven List Dialog Teardown

Last reviewed: 2026-07-16.

## Symptom signatures

- Playwright reports `element is not stable` followed by `element was detached from the DOM`.
- A dialog or sheet opens, then its title/content disappears or never becomes stably visible.
- The failure moves between actions on different rows of the same query-backed list.
- A mutation succeeds, but the confirmation interaction or post-success assertion loses the overlay.
- Known families: `33deef731a10` and `2d93cd67b48a`.

## Mechanism

The overlay is owned by a component rendered beneath a mapped query result, such as `cases.map(...<CaseCard>)` or `visits.map(...<VisitCard>)`. Background, focus, interval, or mutation-triggered query refreshes reconcile, reorder, or remove the row while the overlay is open. Because the dialog or sheet lifecycle is tied to that row, the overlay remounts or unmounts during interaction.

The decisive test is structural: if deleting or replacing the launching row also destroys the open overlay, the product has this mechanism even when the visible failure is a locator timeout.

## Affected repositories and surfaces

- `cbh-admin-frontend`: Home Health case and visit action dialogs; other query-driven list dialogs found by the repository sweep.
- `cbh-mobile-app`: placement sign-on-bonus and badge-history sheets; workplace-review comment and reply action sheets.
- Any React surface that renders modal state and overlay JSX inside a query-backed `.map()` descendant.

## What fixed it

- Hoist overlay ownership above the mapped list into one stable, entity-keyed host. Rows become trigger-only and pass entity identity to the host.
- Add regression coverage that opens the overlay, removes or refreshes the launching row, and proves the overlay survives.
- Add an architecture guard for direct dialog/modal/sheet JSX inside `.map()` callbacks, then perform a semantic sweep for indirect descendants the syntax guard cannot see.
- Split oversized sequential E2E flows after the product fix so one mechanism does not surface as many indistinguishable steps.

The durable Home Health fix is [cbh-admin-frontend#7574](https://github.com/ClipboardHealth/cbh-admin-frontend/pull/7574). Repository-wide follow-ups landed in [cbh-admin-frontend#7569](https://github.com/ClipboardHealth/cbh-admin-frontend/pull/7569), [cbh-mobile-app#12857](https://github.com/ClipboardHealth/cbh-mobile-app/pull/12857), and [cbh-mobile-app#12860](https://github.com/ClipboardHealth/cbh-mobile-app/pull/12860).

## What failed and why

- Repeated `toPass` blocks, response waits, locator retries, failure trackers, and expanded timeouts hardened whichever Home Health step failed most recently but left overlay ownership unchanged. The family recurred across [STAFF-1329](https://linear.app/clipboardhealth/issue/STAFF-1329), [STAFF-1369](https://linear.app/clipboardhealth/issue/STAFF-1369), [STAFF-1495](https://linear.app/clipboardhealth/issue/STAFF-1495), [STAFF-1554](https://linear.app/clipboardhealth/issue/STAFF-1554), [STAFF-1582](https://linear.app/clipboardhealth/issue/STAFF-1582), [STAFF-1673](https://linear.app/clipboardhealth/issue/STAFF-1673), and [STAFF-1685](https://linear.app/clipboardhealth/issue/STAFF-1685).
- Preserving modal state across a remount did not preserve the DOM node Playwright or a user was interacting with. The Team Members recurrence from [STAFF-1422](https://linear.app/clipboardhealth/issue/STAFF-1422) to [STAFF-1459](https://linear.app/clipboardhealth/issue/STAFF-1459) is the precedent.
- Pausing backing-list observers and deferring invalidations in [cbh-admin-frontend#7559](https://github.com/ClipboardHealth/cbh-admin-frontend/pull/7559) reduced the race window but was explicitly an interim mitigation: another ancestor update could still remove the row. The hoisted host later deleted that workaround.
- Splitting the E2E test alone would reduce blast radius and improve fingerprints, but it would not fix the user-facing overlay teardown.

## Current status

Fixed for the known admin and mobile surfaces covered by [STAFF-1789](https://linear.app/clipboardhealth/issue/STAFF-1789), [STAFF-1790](https://linear.app/clipboardhealth/issue/STAFF-1790), [STAFF-1796](https://linear.app/clipboardhealth/issue/STAFF-1796), [STAFF-1797](https://linear.app/clipboardhealth/issue/STAFF-1797), and [STAFF-1806](https://linear.app/clipboardhealth/issue/STAFF-1806). Treat future instances as the same mechanism when overlay ownership is still below a replaceable query row; extend the stable-host pattern and guard rather than adding per-test waits.

## Evidence

- [STAFF-1789](https://linear.app/clipboardhealth/issue/STAFF-1789): mitigation and fault-injection proof for Home Health list refreshes.
- [STAFF-1790](https://linear.app/clipboardhealth/issue/STAFF-1790): durable host design and E2E decomposition.
- [cbh-admin-frontend#7559](https://github.com/ClipboardHealth/cbh-admin-frontend/pull/7559): refetch guard, with residual ownership risk documented.
- [cbh-admin-frontend#7574](https://github.com/ClipboardHealth/cbh-admin-frontend/pull/7574): hoisted host and deletion of the temporary guard.
- [cbh-mobile-app#12857](https://github.com/ClipboardHealth/cbh-mobile-app/pull/12857): mobile sheet hoists and architecture guard.
- [cbh-mobile-app#12860](https://github.com/ClipboardHealth/cbh-mobile-app/pull/12860): indirect workplace-review descendants hoisted after the syntactic guard could not detect them.
