# B8 and Prior-attempts blind backtest — 2026-07-16

## Cohort

- **Window:** 2026-06-01 through 2026-07-16.
- **Size and balance:** 20 flaky-fix plan proxies: 14 human approves and 6 human rejects.
- **Source:** contemporaneous GitHub change bodies were used as plan proxies because the Linear plan snapshots were not available through the execution surface. These bodies preserve the diagnosis, evidence, confidence, proposed fix, and validation claims, but can be more complete than the original pre-implementation plan.
- **Coverage:** browser E2E, mobile E2E, service tests, product races, auth/setup, retry classification, third-party bootstrap, clock boundaries, locators, and CI/deployment guards.
- **Label caveat:** only one reject had a strong contemporaneous requested-change judgment. Five rejects were stale, superseded, or closed without a final public quality rationale. All 14 approves were integrated; 12 also carried the frontend repositories' release marker.
- **Blinding:** an outcome-aware assembler fixed and sanitized the cohort. A separate judge read only the current flaky-critic skill, rubric, and 20 opaque case files. Required outcome-leak and identifier scans returned zero matches. The judge returned exactly one well-formed verdict per case.
- **Correlations:** three cases shared a Cognito identity family, two shared worker-creation collision mechanics, and four touched Home Health through distinct immediate mechanisms. Results are therefore not 20 fully independent mechanisms.

## Raw confusion matrix

The current rubric rejected all 20 cases.

|                    | Human approve | Human reject |
| ------------------ | ------------: | -----------: |
| Critic approve     |             0 |            0 |
| Critic reject      |            14 |            6 |
| Critic needs-human |             0 |            0 |

- **Agreement:** 6/20 (**30%**).
- **False-reject rate:** 14/14 human-approved plans (**100%**).
- **Escalation rate:** 0/20.
- **Strong-label subset:** 1/15 agreement (**6.7%**). The other five raw matches were weak reject labels, so the 30% headline overstates evidence that the rubric reproduced a human quality judgment.
- The one strong human reject was also an unearned mechanism match: the human rejected an obsolete authentication direction, while the critic rejected format omissions under B5/B6/B7/B8/C6.

## New-rule bounce attribution

One plan may be attributed to both rules, so per-rule counts are not additive.

| New rule                | Any bounce | Statement-missing | Substantive |
| ----------------------- | ---------: | ----------------: | ----------: |
| B8 causal chain         |  20 (100%) |          12 (60%) |     8 (40%) |
| B5 Prior-attempts       |    2 (10%) |           2 (10%) |      0 (0%) |
| Either new rule, unique |  20 (100%) |          12 (60%) |     8 (40%) |

The two Prior-attempts bounces were both human-approved plans that referred to earlier related implementation work without the required table. No case supplied evidence that the current plan re-proposed an already-failed mechanism, so the backtest found no substantive Prior-attempts false-reject pattern and no Prior-attempts rubric amendment is proposed.

## Decomposed and adjusted view

### Era artifacts

All cases predated one or both 2026-07-15/16 plan conventions. The dominant artifacts were:

1. **Missing explicit sections:** 12/20 lacked the exact `Causal chain` heading, and 2/20 established prior implementation work without a `Prior attempts` table. This is the same statement-vs-substance distinction recorded in the 2026-06-11 backtest.
2. **Pre-ceiling 5/5 claims:** three plans claimed 5/5 from artifact correlation without inducing the blamed cause. Two were human-approved and one was human-rejected. The current B8 ceiling correctly treats this as substantive, but the historical authors did not have that convention.
3. **Legacy rubric fields:** even after ignoring statement-missing B8 and Prior-attempts findings, the full rubric still rejected every case because the proxies also predated B5 dedup, B6 observability, B7 current-main, or C6 sibling-repo statements.

Two adjusted views make the assumptions explicit:

- **New rules only, ignoring their statement-missing era artifacts:** 12/20 agreement (**60%**). Eight substantive B8 rejects remain; three match human rejects and five reject human-approved plans.
- **Also treating pre-rule 5/5 overclaims as an era artifact:** 13/20 agreement (**65%**). Five symptom-terminated or unresolved harness/backend diagnoses remain substantive B8 rejects.

These adjusted scores are diagnostic, not replacements for the 30% raw score.

### Weak ground truth

Five of six human-reject labels were not clear plan-quality judgments. They contributed five of the six raw matches:

- one stale/not-pursued change;
- two supersession-like closures;
- two closures without a final public rejection rationale.

They remain in the fixed cohort and raw matrix, but should not be used to claim the gate reproduced reviewer taste.

### Substantive disagreement

Five human-approved plans received substantive B8 rejects:

- two exact threshold/timing diagnoses claimed 5/5 without induced reproduction;
- two local harness fixes named a concrete remount/actionability mechanism but left the deeper trigger partly inferred;
- one classified authentication retry stopped at the 401 failure class rather than its owning cause.

That is 5/20 of the corpus and 5/14 human-approved cases, so it exceeds the task's approximate 10% proposal threshold. The evidence is historical and pre-convention, so the proposals below are drafted for approval and were **not** applied.

## Rubric amendment proposals

### Proposal 1 — deterministic-boundary reproduction equivalence

Proposed addition under B8's confidence ceiling:

> **Deterministic-boundary equivalence:** for a pure clock, calendar, configuration, or literal-threshold defect, a failing artifact plus an exact evaluation of the named code expression at the captured inputs may count as the focused lower-level reproduction required for 5/5. The plan must show the before/after values and why the result is deterministic. Timestamp correlation or a plausible boundary narrative without that evaluation remains capped at 4/5.

This is intended to cover deterministic non-E2E failures without treating production-style fault injection as the only form of reproduction.

<!-- flaky-critic: amendment-proposal -->

### Proposal 2 — named harness-contract terminus

Proposed addition under B8's valid terminal states:

> **Harness-contract terminus:** for a C1/C2 test-harness change, the chain may terminate at a specific violated harness contract in named code when artifacts prove the user action or downstream request never began, and the fix is bounded, idempotent, and diagnostic. If a product, service, or identity-provider cause may still exist, cap confidence at 3/5 and require owning-surface observability or a linked handoff. A generic timeout, detach, 401, or retry success without the named contract and evidence remains a symptom, not a terminus.

This would distinguish a proven harness control-flow defect from a generic symptom patch while preserving the cross-boundary requirement for unresolved product/backend causes.

<!-- flaky-critic: amendment-proposal -->

## Borderline cases for human review

- **Case 05 — approved worker-collision retry:** supplied text established a prior implementation, but it was ambiguous whether the retry's existing shared budget and diagnostics satisfied C1.
- **Case 07 — weak reject CI/deploy guard:** the plan described the unverified-deployment mechanism but lacked a run-level artifact; the human outcome was supersession rather than a quality judgment.
- **Case 11 — approved URL-state product fix:** evidence showed the user-visible panel opened while URL state was lost, but the judge found the A5 user-facing failure statement too implicit.
- **Case 15 — approved Cognito replacement:** the plan clearly superseded an earlier alias-lookup approach, making Prior-attempts applicable, but its replacement nature also makes the missing table an era artifact rather than evidence of repeated diagnosis.

## Monitoring decision

The historical statement-missing rate for the new rules was 12/20 (**60%**), above the ratified 25% threshold. It does **not** trigger a historical rubric change: the cases predate the conventions, and flaky-debug's current `references/plan.md` already requires both `Causal chain` and `Prior attempts`.

Live enforce-mode monitoring is implemented in the flaky-critic skill for the 14-day window starting 2026-07-16 and ending before 2026-07-30:

- denominator: unique gated ticket content-states;
- numerator: amend-and-resubmit markers naming statement-missing B8 or B5 Prior-attempts;
- headline plans are deduplicated when both rules fire, with per-rule attribution retained;
- more than 25% at window close triggers a fix-forward change to flaky-debug's plan-producing instructions/templates, never a weaker gate;
- any systematic substantive false-reject pattern triggers a Rocky-approved rubric amendment proposal regardless of rate.

## What this establishes

The run confirms that both new rules are mechanically checkable and that the statement-vs-substance split is essential. It also shows that the recent historical corpus is a poor raw agreement benchmark for the current full rubric: the plan proxies predate several required fields, and most negative outcomes are weak labels.

It does not establish that B8 or Prior-attempts should be weakened, nor does it validate the live bounce rate. The ratified two-week enforce-mode monitoring window is the relevant evidence for planner-template propagation and live substantive false rejects.

## Case ledger

| Case | Source                                                                           | Human   | Label  | Critic | B8          | Prior-attempts |
| ---- | -------------------------------------------------------------------------------- | ------- | ------ | ------ | ----------- | -------------- |
| 01   | [admin #7373](https://github.com/ClipboardHealth/cbh-admin-frontend/pull/7373)   | reject  | strong | reject | statement   | none           |
| 02   | [backend #26392](https://github.com/ClipboardHealth/clipboard-health/pull/26392) | approve | strong | reject | substantive | none           |
| 03   | [admin #7559](https://github.com/ClipboardHealth/cbh-admin-frontend/pull/7559)   | approve | strong | reject | statement   | none           |
| 04   | [mobile #12521](https://github.com/ClipboardHealth/cbh-mobile-app/pull/12521)    | reject  | weak   | reject | substantive | none           |
| 05   | [admin #7282](https://github.com/ClipboardHealth/cbh-admin-frontend/pull/7282)   | approve | strong | reject | statement   | statement      |
| 06   | [mobile #12635](https://github.com/ClipboardHealth/cbh-mobile-app/pull/12635)    | approve | strong | reject | statement   | none           |
| 07   | [admin #6824](https://github.com/ClipboardHealth/cbh-admin-frontend/pull/6824)   | reject  | weak   | reject | statement   | none           |
| 08   | [admin #7390](https://github.com/ClipboardHealth/cbh-admin-frontend/pull/7390)   | approve | strong | reject | statement   | none           |
| 09   | [backend #26528](https://github.com/ClipboardHealth/clipboard-health/pull/26528) | approve | strong | reject | statement   | none           |
| 10   | [admin #7380](https://github.com/ClipboardHealth/cbh-admin-frontend/pull/7380)   | reject  | weak   | reject | statement   | none           |
| 11   | [admin #7336](https://github.com/ClipboardHealth/cbh-admin-frontend/pull/7336)   | approve | strong | reject | statement   | none           |
| 12   | [mobile #12633](https://github.com/ClipboardHealth/cbh-mobile-app/pull/12633)    | approve | strong | reject | statement   | none           |
| 13   | [admin #6974](https://github.com/ClipboardHealth/cbh-admin-frontend/pull/6974)   | reject  | weak   | reject | substantive | none           |
| 14   | [admin #7374](https://github.com/ClipboardHealth/cbh-admin-frontend/pull/7374)   | approve | strong | reject | substantive | none           |
| 15   | [admin #7596](https://github.com/ClipboardHealth/cbh-admin-frontend/pull/7596)   | approve | strong | reject | statement   | statement      |
| 16   | [mobile #12270](https://github.com/ClipboardHealth/cbh-mobile-app/pull/12270)    | reject  | weak   | reject | substantive | none           |
| 17   | [admin #7250](https://github.com/ClipboardHealth/cbh-admin-frontend/pull/7250)   | approve | strong | reject | substantive | none           |
| 18   | [admin #7370](https://github.com/ClipboardHealth/cbh-admin-frontend/pull/7370)   | approve | strong | reject | substantive | none           |
| 19   | [admin #7320](https://github.com/ClipboardHealth/cbh-admin-frontend/pull/7320)   | approve | strong | reject | substantive | none           |
| 20   | [admin #7386](https://github.com/ClipboardHealth/cbh-admin-frontend/pull/7386)   | approve | strong | reject | statement   | none           |
