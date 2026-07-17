<!-- cspell:ignore backtest -->

# 2026-07-17 Acceptance Report

This is a targeted, write-free acceptance check for the handoff examples. It is
not a promotion-grade blind backtest, a reusable test fixture, or a replacement
for live shadow agreement.

## Cohort and cutoff

- Window: `2026-06-26T00:00:00Z` through `2026-07-17T14:30:00Z`.
- Primary PR scan: 31 merged `flaky-test-fix` PRs: 23 in
  `cbh-admin-frontend`, five in `cbh-mobile-app`, and three in
  `clipboard-health`.
- Source-ticket resolution: 30 of 31 primary PRs carry a `STAFF-*` ID in the
  title or body. `clipboard-health#26528` is unresolved and therefore produces
  no action.
- Merged fix: `ClipboardHealth/cbh-admin-frontend#7608`, merged
  `2026-07-17T13:08:25Z`, source ticket `STAFF-1846`.
- Supersession candidate: `STAFF-1856`, sighting
  `2026-07-16T14:30:36Z`.
- Bounce cohort: `STAFF-1860`, `STAFF-1862`, `STAFF-1868`, `STAFF-1873`, and
  `STAFF-1874`; critic verdicts were posted around `2026-07-17T12:09Z`.
- Bounce evaluation time: `2026-07-17T14:30:00Z` with
  `--bounce-age-days=0`. This override tests verdict detection and routing;
  production retains the three-day default so later amendments can suppress
  re-dispatch.

The decision pass uses ticket plans, verdict text, PR body and diff metadata,
merge time, and sighting time. Human close-out outcomes are used only in the
result comparison.

The KB contract landed at the end of this window. A full-description Linear
search for `KB close-out` found two implementation plans: `STAFF-1856`, whose
mechanism was fixed by merged #7608, and `STAFF-1874`, whose proposed fix had
not merged and therefore remains pending. The bounce scan found the five named
Triage tickets below.

## Proposed dry-run actions

### KB close-out

`STAFF-1856` contains a pending close-out for
`query-driven-list-dialog-teardown.md`. PR #7608 fixes the provider-topology
variant that remounted the authenticated route above the open Home Health menu.

Expected update:

- Add the provider-topology recurrence as another replaceable-ancestor surface.
- Record #7608 and its delayed or immediate-token regression coverage.
- Record that the dialog-only hoist in #7574 was correctly scoped but could not
  prevent a remount from a higher provider boundary.
- Link the resulting focused `core-utils` KB PR from `STAFF-1856` and
  `STAFF-1846`.

### D3 supersession

Would close `STAFF-1856` as Done under D3:

- same terminal cause: token-dependent `KnockProviderWrapper` topology switch
  remounts the authenticated route;
- same signature class: an already-resolved menu item detaches before its user
  action starts;
- sighting `2026-07-16T14:30:36Z` predates merge
  `2026-07-17T13:08:25Z`;
- #7608 changed the same composition files named by the plan and added the
  requested token-resolution regression.

The PR lacked the `flaky-test-fix` label, so it is admitted only through the
linked flaky deep-dive ticket fallback and reported as a label-hygiene risk.

### Bounce re-dispatch

Would re-dispatch each first bounce to Todo for plan amendment:

| Ticket     | Verdict gap to carry into the re-plan instruction                                         |
| ---------- | ----------------------------------------------------------------------------------------- |
| STAFF-1860 | C1 requires same-identity reconciliation after ambiguous 504, fresh identity on collision |
| STAFF-1862 | A3 plan must state fake-timer restoration in `afterEach`                                  |
| STAFF-1868 | B1 forbids token-minting refresh retries without non-amplifying control                   |
| STAFF-1873 | B1/B6/B8 require no uncapped 429 retry and a terminated causal chain                      |
| STAFF-1874 | B1/B6/B8 require no uncapped 429 retry and a terminated owning-service cause              |

No ticket had a prior closeout re-dispatch marker or a second critic rejection
at the frozen cutoff. Their critic comments use the legacy
`verdict=reject mode=enforce` marker without a disposition field; the bounce
scan accepts that enforce-only shape while still excluding shadow markers.

## Outcome comparison

- **D3:** match. Rocky's `STAFF-1856` close-out cited #7608, the exact mechanism,
  the pre-merge sighting, Done, the 21-day verifying window, and recurrence
  reopen behavior.
- **KB:** match. The human close-out explicitly transferred the
  provider-topology recurrence, #7608, and the dialog-only-hoist scope lesson to
  the KB close-out.
- **Bounces:** all five verdicts are detected with the required amendment
  content. This report evaluates routing, not whether the later planner
  produced an acceptable amendment.

## Limitations

- The cohort was selected from named handoff examples and is not balanced.
- The #7608 missing-label fallback is necessary for this case but needs live
  monitoring for false inclusion.
- The acceptance check does not grade ambiguous supersession precision,
  second-bounce handling, KB edit quality across multiple entries, or live
  tool/write idempotency.
- Before production scheduling, run a larger blind backtest and a live
  write-free shadow pass.
