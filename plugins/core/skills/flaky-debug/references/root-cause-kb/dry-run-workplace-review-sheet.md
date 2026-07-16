# Dry Run: Workplace-Review Sheet Knowledge-Base Cycle

- **Mode:** Retrospective dry run; no external writes
- **Repository:** `cbh-mobile-app`
- **Surface:** Workplace-review comment and reply action sheets
- **Fix evidence:** [cbh-mobile-app#12860](https://github.com/ClipboardHealth/cbh-mobile-app/pull/12860)
- **Date:** 2026-07-16

This dry run demonstrates the required diagnosis-to-close-out cycle using a real merged fix. It reconstructs the statements the workflow must produce; it does not claim that the historical investigation originally consulted an entry that was created later.

## 1. Diagnosis lookup

Observed symptom signatures:

- A sheet opens from a query-backed review or reply row, then disappears or loses its actionable content.
- The failure occurs while the backing list can refetch or reconcile.
- Retries at the locator or interaction site do not make the sheet lifecycle stable.

Index lookup output:

```text
KB match: query-driven-list-dialog-teardown.md
Matched symptom signature: dialog or sheet opens, then its content does not remain stably visible
Mechanism hypothesis: the sheet is owned below a query-driven mapped row and unmounts when that row reconciles
Failed fixes to avoid: locator retries, response waits, expanded timeouts, and state preservation that leaves overlay ownership below the replaceable row
```

Candidate read in full: [Query-driven list dialog teardown](./query-driven-list-dialog-teardown.md).

The failure surface and component ownership select this entry. A shared `element was detached` string alone would not be enough; the causal evidence must show that the open sheet is a descendant of the replaceable query row.

## 2. Plan excerpt seeded by the entry

```text
KB match: Query-driven list dialog teardown
Matched signature: open query-row sheet disappears during list reconciliation
Mechanism hypothesis: overlay lifecycle is coupled to a replaceable mapped row
Known failed fixes: interaction retries and timeout expansion leave ownership unchanged; preserving modal state does not preserve the active DOM subtree

Root cause: workplace-review comment and reply action sheets are rendered beneath query-backed mapped rows. A refetch can reconcile the launching row and destroy the open sheet during interaction.

Proposed fix: hoist the action sheets into one stable, entity-keyed host above the mapped list. Keep rows trigger-only.
```

The entry seeds the mechanism and failed-fix history, but the plan still has to prove the current ownership chain from source and artifacts. The plan cites the entry rather than presenting the mechanism as novel.

## 3. Post-merge close-out dry-run output

After `cbh-mobile-app#12860` merged, the close-out chooses an existing entry because the causal mechanism is unchanged:

```text
KB close-out dry run
Entry: references/root-cause-kb/query-driven-list-dialog-teardown.md
Symptom signature: workplace-review comment or reply sheet disappears while its query-backed row reconciles
Mechanism: overlay lifecycle is coupled to a replaceable query-driven mapped row
Update type: new repository/surface and new fix evidence
Sections: Affected repositories and surfaces; What fixed it; Current status; Evidence
Evidence: cbh-mobile-app#12860
```

Expected entry changes:

- **Affected repositories and surfaces:** add the workplace-review comment and reply action sheets under `cbh-mobile-app`.
- **What fixed it:** record that the sheets were hoisted to a stable host and rows became trigger-only.
- **Current status:** mark the known workplace-review descendants fixed while retaining the lookup guidance for future surfaces.
- **Evidence:** link `cbh-mobile-app#12860`.
- **Symptom index:** no new row required because the existing disappearing-sheet signature already retrieves this mechanism.

Resulting entry: [Query-driven list dialog teardown](./query-driven-list-dialog-teardown.md) now names the workplace-review surfaces, records `cbh-mobile-app#12860` as the repository-wide indirect-descendant fix, and links that PR in its evidence.

Final close-out statement:

```text
Knowledge-base close-out: [Query-driven list dialog teardown](./query-driven-list-dialog-teardown.md)
Update: new repository/surface and new fix evidence
Mechanism: overlay lifecycle coupled to a replaceable query-driven mapped row
Evidence: [cbh-mobile-app#12860](https://github.com/ClipboardHealth/cbh-mobile-app/pull/12860)
KB PR: [ClipboardHealth/core-utils#785](https://github.com/ClipboardHealth/core-utils/pull/785)
```

The retrospective KB publication is [core-utils#785](https://github.com/ClipboardHealth/core-utils/pull/785). This is an entry update, not a new entry: the repository and sheet names are new evidence for the same mechanism, not a genuinely novel causal terminus.
