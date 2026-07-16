# Dry run: Home Health `fullLifecycle.spec.ts` chronic flake

- **Repo:** `cbh-admin-frontend`
- **Spec:** `playwright/e2e/homeHealth/fullLifecycle.spec.ts`
- **Fingerprint family:** `33deef731a10` with related variants
- **Status:** Closed as Done at least six times before recurring
- **Investigator:** Deep-dive track; diagnosis and design only
- **Confidence:** 4/5; the causal chain terminates, but fault injection remains
- **Source:** Real chronic-family deep dive completed on 2026-07-07
- **Historical code SHA:** `fe4e2cd8424`
- **Current-main SHA checked:** `1bafb36f8f909274b96eef840655ffdc7e15f9d0`

This checked-in dry run demonstrates the expected depth and document shape. The original investigation lacked a VPN-capable environment, which correctly held confidence below 5/5. The credential-checked forward rerun below stopped before diagnosis, as the new skill requires.

## 0. Credential preflight and current-main status

### Credential-checked forward rerun on 2026-07-16

- Datadog APM: passed a staging span query through `pup`.
- Datadog logs: passed a staging log query through `pup`.
- Staging VPN: failed. `curl --connect-timeout 10 --max-time 20 https://apigateway.staging.clipboardhealth.org/api/healthCheck` exited 56 with `CONNECT tunnel failed, response 403`.
- AWS: failed. `aws sts get-caller-identity --profile sdlc` exited 255 because the `sdlc` profile was not configured.

The live forward test stopped at Phase 0 and produced a provisioning-ticket body. It did not reuse the historical diagnosis as if current credentials had passed.

### Current main

The historical designed fix has since landed:

- [PR #7574](https://github.com/ClipboardHealth/cbh-admin-frontend/pull/7574), commit `e6818dabd950d43755c3ec96de0373062a4522ba`, hoisted the Home Health action dialogs and split the 2,096-line mega-spec.
- [PR #7581](https://github.com/ClipboardHealth/cbh-admin-frontend/pull/7581), commit `ed0f1e63e39e24e771b47cbe883f5925be9d45d6`, hardened the stable host and case-dialog loading path.
- At `origin/main@1bafb36f8f909274b96eef840655ffdc7e15f9d0`, `HomeHealthDialogHost.tsx:67-77` renders the active dialog beside the list children, and `HomeHealthActiveDialog.tsx:63-81` owns every case and visit action dialog.

A new investigation must stop as already fixed unless recurrence evidence post-dates those commits. The implementation matching the dry run's design is evidence that the causal document was actionable; it is not permission for this skill to open a PR.

## 1. Dossier

The spec was created by consolidating seven Home Health E2E files into one ten-step lifecycle test. Every later fix hardened the step where the failure last surfaced. None removed the product lifecycle churn shared by the failures.

| Prior ticket/PR/commit                | What it blamed                                | What it changed                                                                                                          | Recurrence evidence                                                                                                                 |
| ------------------------------------- | --------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------- |
| STAFF-1329 / PR #6902 / `d6633c656e3` | Occurrence tab readiness                      | Added waits for occurrence tabs                                                                                          | Failure moved to visit-row lookup in STAFF-1369                                                                                     |
| STAFF-1327 / PR #6903 / `f1bf003b6c2` | Visit-verification tab state                  | Changed product tab state and spec waits                                                                                 | Failure moved to visit-row and ROC lookup                                                                                           |
| STAFF-1369 / PR #6915 / `3a11b8effc8` | Visit-row render race                         | Added row-lookup retries and a negotiation tweak                                                                         | Recurred as ROC visit lookup in STAFF-1495                                                                                          |
| STAFF-1377 / PR #6930 / `07491124e72` | Remove-booked-worker assertion                | Changed the dialog and assertion                                                                                         | Later failures surfaced in other dialogs                                                                                            |
| STAFF-1449 / PR #6987 / `53330b9c0ea` | Create transport errors                       | Added fail-fast handling and more waits                                                                                  | The family recurred; machinery grew without removing the cause                                                                      |
| STAFF-1441 / PR #6990 / `51577fa1778` | Response-wait timing                          | Rewrote lifecycle response waits                                                                                         | STAFF-1495 recurred within days                                                                                                     |
| STAFF-1495 / PR #7050 / `5ebd5ee839a` | ROC visit lookup                              | Hardened ROC-specific lookup                                                                                             | STAFF-1554 recurred at auth-refresh waits                                                                                           |
| STAFF-1554 / PR #7251 / `2f942662c37` | Auth refresh during waits                     | Added a 306-line response helper tolerant of refresh                                                                     | STAFF-1582 recurred at close case                                                                                                   |
| STAFF-1582 / PR #7316 / `28bdf114626` | Close-case flow                               | Reworked close-case steps                                                                                                | STAFF-1685 recurred with the identical title                                                                                        |
| STAFF-1601 / PR #7321 / `b09225ddc35` | Visit-verification modal state                | Changed occurrence-table dialog behavior                                                                                 | STAFF-1673 recurred at cancel-visit dialog                                                                                          |
| STAFF-1673 / PR #7374 / `ac7c1b79ae5` | Cancel-visit dialog open                      | Added `toPass`, immediate-failure tracking, and diagnostics                                                              | STAFF-1682 recurred six days later at close case                                                                                    |
| STAFF-1685 / PR #7390 / `fe4e2cd8424` | Close case again                              | Added another large close-case hardening block                                                                           | STAFF-1659 and STAFF-1682 still failed                                                                                              |
| STAFF-1789 / PR #7559 / `2b7ebc87c2d` | Backing-list refreshes while dialogs are open | Paused/canceled list observers and deferred invalidations behind `HomeHealthListRefetchGuard` with fault-injection tests | The PR documented that dialogs still lived below mapped cards; PR #7574 removed the 217-line guard and implemented the durable host |
| STAFF-1790 / PR #7574 / `e6818dabd95` | Dialog lifecycle coupled to mapped cards      | Hoisted all desktop action dialogs and split the mega-spec                                                               | No post-merge recurrence found in the current-main recheck                                                                          |
| PR #7581 / `ed0f1e63e39`              | Remaining host loading/history edges          | Hardened the stable host and case-dialog loading path                                                                    | No post-merge recurrence found in the current-main recheck                                                                          |

### Ruled-out prior hypotheses

Before the durable host in PR #7574, the next attempt had to rule out the twelve symptom fixes and the #7559 mitigation:

- Readiness and locator timing are incomplete explanations because the same family migrated across tabs, rows, auth waits, and several independent dialogs after those waits landed.
- Response-wait rewrites are incomplete because later signatures show DOM detachment after the response machinery was centralized.
- Preserving one dialog's state is incomplete because sibling dialogs under the same list-item lifecycle continued to unmount.
- More retries are falsified by recurrence after roughly one thousand net lines of retry and diagnostic apparatus accumulated in the spec and helpers.
- Pausing known list refreshes was incomplete because #7559's own residual-risk statement left the dialogs below mapped cards and exposed them to ancestor updates outside those queries.

### Latest recurrence signatures

- STAFF-1682: the close button repeatedly became unstable and detached from the DOM during `locator.click`.
- STAFF-1659: the cancel-visit dialog title never reached a stable visible state within 30 seconds.

Both signatures point to component lifecycle churn, not a slow assertion.

## 2. Causal chain

**Terminal cause:** Home Health action dialogs are React descendants of query-backed list items. The dialogs' own mutations invalidate and refresh those lists. Background refreshes and status changes reconcile, reorder, or remove the list item while its dialog is open, destabilizing or unmounting the dialog subtree.

```text
Playwright click or dialog-title assertion fails
→ the open dialog becomes unstable or disappears
→ query invalidation/background refetch returns a new case or visit list
→ CaseCard or VisitCard reconciles, reorders, or leaves the open list
→ the dialog subtree, owned by that list item, remounts or unmounts
→ terminal cause: dialog lifecycle is coupled to invalidated list-item lifecycle
```

### Ownership and historical code

- `useUpdateVisit.ts:66` invalidates the case-visits query after mutations.
- `useUpdateCase.ts:44-56` invalidates open and closed agency-case queries plus case-visits data.
- `useCaseVisits.ts` and `useAgencyCases.ts:69` use five-minute stale and ten-minute interval refresh behavior.
- `CaseVisits.tsx:42` sorts and maps visits on render.
- `CaseActionsMenu.tsx:92` renders `CaseCloseDialog` inside the case card's actions.
- `Visit/VisitActions.tsx:70` renders `CancelVisitDialog` inside the visit card's actions.

Groundtruth resolves service `admin-web-app` to repository `cbh-admin-frontend`; its listed owners are Synapse, Platform, Growth, Tempo, Alchemy, and Action. The repository registry owner is Platform. No backend service is needed to terminate this particular chain.

### Close-case chain

1. The test opens the close dialog and clicks Close.
2. A list invalidation or background refetch resolves while the dialog is open.
3. The cases array changes and the owning card rerenders, producing the observed unstable element.
4. The close mutation changes the case to closed.
5. The open-cases query returns without that case, unmounting the card and dialog, producing the observed detached element.

### Cancel-visit chain

1. The test opens the cancel dialog.
2. A prior visit mutation's invalidation resolves.
3. The visit list resorts or reconciles.
4. The owning visit card and its dialog remount.
5. The title disappears before it reaches a stable asserted state.

## 3. Root cause and confidence

Home Health action dialogs bind their lifecycle to `CaseCard` and `VisitCard` instances produced by refetching lists. Those lists are invalidated by the dialogs' mutations and refreshed independently. A refetch during an open dialog can reconcile or remove the owning item, destroying the dialog during user interaction.

This is a user-facing product race, not test-only behavior. A real administrator can lose an open dialog during background refresh; the long CI workflow merely expands the race window.

Confidence is **4/5**. The render ownership, invalidation path, refresh behavior, and failure signatures establish a terminated static chain. Fault injection is still required for 5/5.

## 4. Designed fix

### Root fix

Hoist Home Health case and visit action dialogs out of `CaseCard` and `VisitCard` into one stable dialog host mounted above the query-backed lists.

- Add a `HomeHealthDialogHost` at the page or dashboard shell.
- Make list items request `openDialog({ kind, entityId })` instead of owning modal state and rendering dialogs inline.
- Keep one dialog instance keyed by entity ID in a subtree unaffected by list reconciliation.
- Close only on explicit user action or mutation success.

### Defense in depth

While a Home Health dialog is open, pause optional focus/interval refresh churn or defer broad invalidation until the dialog closes. This reduces churn but does not replace the lifecycle fix.

### Cleanup after the root fix

Remove the `toPass` blocks, immediate-failure trackers, and open-dialog retry apparatus added by prior attempts once fault injection proves the stable host survives refreshes.

### Test decomposition

Split the ten-step mega-spec into smaller product-surface workflows with isolated seeded data, retaining one thin lifecycle smoke path if required. This reduces blast radius and gives each real mechanism a distinct fingerprint.

## 5. Fault-injection reproduction

1. Run the affected flow against a seeded case.
2. Delay the close mutation while forcing the open-cases query to refetch and resolve during the click.
3. Expect the current implementation to reproduce the detached-element signature.
4. For cancel visit, force the case-visits refetch to resolve while the dialog is open and expect the title to disappear.
5. Apply a prototype of the stable dialog host.
6. Repeat both injections and prove the dialogs survive.
7. Run the affected specs repeatedly with Playwright retries disabled.

The original dry run could not execute these steps because the environment lacked staging VPN access. Under the new skill, that precondition failure requires a provisioning ticket rather than continued investigation.

## 6. Observability fallback

If fault injection cannot yet run after access is provisioned, add a CI-visible dialog generation counter and emit an event whenever a Home Health dialog unmounts without explicit close or mutation success. Include dialog kind, entity ID, query keys invalidated in the preceding window, and a correlation ID exposed in the Playwright reporter.

The next occurrence should answer directly whether a list refetch caused the unexpected unmount.

## 7. Evidence appendix

- Chronic family: `33deef731a10` plus variants.
- Consolidation: [PR #6616](https://github.com/ClipboardHealth/cbh-admin-frontend/pull/6616), commit `afb53308a38`.
- Latest signatures: STAFF-1682 close-case detachment and STAFF-1659 cancel-dialog invisibility.
- Historical code checkout: `cbh-admin-frontend@fe4e2cd8424`.
- Current-main checkout: `cbh-admin-frontend@1bafb36f8f909274b96eef840655ffdc7e15f9d0`.
- Ownership query: `jq '.services[] | select(.repo == "cbh-admin-frontend")' groundtruth/registry/services.json`.
- Repository query: `jq --arg repo cbh-admin-frontend '.repos[] | select(.id == $repo)' groundtruth/registry/repos.json`.
- Current-main verification: `git log origin/main -- HomeHealthActiveDialog.tsx HomeHealthDialogHost.tsx`.
- Key historical product areas: `CaseDashboard`, `CaseActionsMenu`, `CaseVisits`, `VisitActions`, `useUpdateCase`, `useUpdateVisit`, `useAgencyCases`, and `useCaseVisits`.
- Prior PRs: [#6902](https://github.com/ClipboardHealth/cbh-admin-frontend/pull/6902), [#6903](https://github.com/ClipboardHealth/cbh-admin-frontend/pull/6903), [#6915](https://github.com/ClipboardHealth/cbh-admin-frontend/pull/6915), [#6930](https://github.com/ClipboardHealth/cbh-admin-frontend/pull/6930), [#6987](https://github.com/ClipboardHealth/cbh-admin-frontend/pull/6987), [#6990](https://github.com/ClipboardHealth/cbh-admin-frontend/pull/6990), [#7050](https://github.com/ClipboardHealth/cbh-admin-frontend/pull/7050), [#7251](https://github.com/ClipboardHealth/cbh-admin-frontend/pull/7251), [#7316](https://github.com/ClipboardHealth/cbh-admin-frontend/pull/7316), [#7321](https://github.com/ClipboardHealth/cbh-admin-frontend/pull/7321), [#7374](https://github.com/ClipboardHealth/cbh-admin-frontend/pull/7374), [#7390](https://github.com/ClipboardHealth/cbh-admin-frontend/pull/7390), [#7559](https://github.com/ClipboardHealth/cbh-admin-frontend/pull/7559), [#7574](https://github.com/ClipboardHealth/cbh-admin-frontend/pull/7574), and [#7581](https://github.com/ClipboardHealth/cbh-admin-frontend/pull/7581).
- Historical limitation: the surviving document did not retain the exact Actions run URL, trace ID, or request ID. New `flaky-deep-dive` outputs must retain them when applicable.
- Historical output: Rocky's `hh-full-lifecycle.md`, created 2026-07-07.
