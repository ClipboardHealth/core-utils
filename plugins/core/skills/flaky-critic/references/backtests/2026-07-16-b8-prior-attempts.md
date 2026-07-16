# B8 and Prior-attempts blind backtest — 2026-07-16

## Cohort

- **Window:** 2026-06-01 through 2026-07-16.
- **Size and balance:** 20 historical flaky-fix plans: 14 human approves and 6 human rejects.
- **Source:** each input is the Linear implementation-ticket description captured in the timestamped GitHub `linear-code` linkback comment when the ticket was linked to its change, before later human review or closing context. All 20 snapshots were present and non-truncated.
- **Coverage:** browser E2E, mobile E2E, service tests, product races, auth/setup, retry classification, third-party bootstrap, clock boundaries, locators, and CI/deployment guards.
- **Label caveat:** only one reject had a strong contemporaneous requested-change judgment. Five rejects were stale, superseded, or closed without a final public quality rationale. All 14 approves were integrated; 13 also carried the frontend repositories' release marker.
- **Blinding:** an outcome-aware assembler fixed and sanitized the cohort. A separate judge read only the current flaky-critic skill, rubric, and 20 opaque case files. Required outcome-leak and identifier scans returned zero matches. The judge returned exactly one well-formed verdict per case.
- **Audit bundle:** the [cohort notes](./2026-07-16-b8-prior-attempts/cohort.md), [answer key and source manifest](./2026-07-16-b8-prior-attempts/answer-key.json), [input hashes](./2026-07-16-b8-prior-attempts/input-hashes.txt), [structured blind verdicts](./2026-07-16-b8-prior-attempts/verdicts.jsonl), and sanitized `inputs/` are frozen beside this report. The manifest records the exact plan-comment permalink, capture time, pre-outcome check, and SHA-256 for every case.
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
| B8 causal chain         |   19 (95%) |           8 (40%) |    11 (55%) |
| B5 Prior-attempts       |    7 (35%) |           2 (10%) |     5 (25%) |
| Either new rule, unique |  20 (100%) |           7 (35%) |    13 (65%) |

The unique row uses the final disposition: seven plans had only statement-missing new-rule findings, while 13 had at least one substantive B8 or Prior-attempts finding. Per-rule columns overlap.

The two statement-missing Prior-attempts bounces omitted the required table after referring to prior implementation work. Five plans received substantive Prior-attempts rejects; four were human-approved. That systematic disagreement is addressed by Proposal 3 below.

## Decomposed and adjusted view

### Era artifacts

All cases predated one or both 2026-07-15/16 plan conventions. The dominant artifacts were:

1. **Missing explicit sections:** 8/20 lacked the exact `Causal chain` heading without a demonstrated broken chain, and 2/20 established prior implementation work without a `Prior attempts` table. This is the same statement-vs-substance distinction recorded in the 2026-06-11 backtest.
2. **Pre-ceiling 5/5 claims:** four plans claimed 5/5 from artifact correlation without inducing the blamed cause. Three were human-approved and one was human-rejected. The current B8 ceiling correctly treats this as substantive, but the historical authors did not have that convention.
3. **Legacy rubric fields:** even after ignoring statement-missing B8 and Prior-attempts findings, the full rubric still rejected every case because the plans also predated B5 dedup, B6 observability, B7 current-main, or C6 sibling-repo statements.
4. **Pre-chronic-routing approvals:** five plans carried substantive Prior-attempts findings under the current rule, including families with multiple prior stabilizations. Four were human-approved before the chronic route and mechanism-comparison convention existed.

Two adjusted views make the assumptions explicit:

- **Full rubric, ignoring only new-rule statement omissions:** 5/20 exact agreement (**25%**) plus one safe needs-human non-match. Legacy statement requirements and substantive findings still reject the other cases.
- **New-rule attribution only, treating statement-only bounces as passes:** 7/20 agreement (**35%**). Thirteen substantive new-rule rejects remain; three match human rejects and ten reject human-approved plans.
- **Also treating pre-rule 5/5 overclaims as an era artifact:** 10/20 agreement (**50%**). The remaining disagreements concentrate in unresolved harness/backend diagnoses and mechanism-insensitive Prior-attempts counting.

These adjusted scores are diagnostic, not replacements for the 30% raw score.

### Weak ground truth

Five of six human-reject labels were not clear plan-quality judgments. They contributed five of the six raw matches:

- one stale/not-pursued change;
- two supersession-like closures;
- two closures without a final public rejection rationale.

They remain in the fixed cohort and raw matrix, but should not be used to claim the gate reproduced reviewer taste.

### Substantive disagreement

Ten human-approved plans received at least one substantive new-rule reject:

- three deterministic threshold/collision/timing diagnoses claimed 5/5 without induced reproduction;
- four local harness fixes named a remount, actionability, or classified-auth mechanism but left the deeper trigger partly inferred;
- four plans were rejected under Prior-attempts because the family had multiple earlier stabilizations or the plan extended an existing mechanism;
- some plans appear in more than one pattern.

That is 10/20 of the corpus and 10/14 human-approved cases, so it exceeds the task's approximate 10% proposal threshold. The evidence is historical and pre-convention, so the proposals below are drafted for approval and were **not** applied.

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

### Proposal 3 — mechanism-aware Prior-attempts counting

Proposed replacement for the substantive-reject and chronic-counting sentences in B5's Prior-attempts amendment:

> **Mechanism-aware prior attempts:** count a merged fix as failed for the ≥2 chronic threshold only when recurrence evidence falsifies the same terminal-cause hypothesis or shows that the same mechanism did not hold. A recurrence in the same fingerprint family after a materially different fix remains required context but does not automatically increment the failed-fix count. Reusing or extending an earlier helper is not a substantive reject when the plan identifies a new, previously unhandled failure signature, shows that the earlier signature remains fixed, and states the exact mechanism delta. Repeating the same causal claim or broadening the same mechanism without new falsifying evidence remains a substantive reject.

This would prevent family-level recurrence alone from making distinct mechanisms look like repeated failed diagnoses, while preserving rejection of unchanged attempts.

<!-- flaky-critic: amendment-proposal -->

## Borderline cases for human review

- **Case 09 — approved clock-in boundary fix:** the boundary evidence was specific, but the plan lacked the newly required explicit causal-chain section.
- **Case 13 — weak reject broad retry investigation:** Prior-attempts was statement-missing, while the supplied snapshot did not contain a classifiable implementation plan; without the new rule the result was needs-human.
- **Case 15 — approved Cognito replacement:** the plan clearly superseded an earlier alias-lookup approach, making Prior-attempts applicable, but its replacement nature also makes the missing table an era artifact rather than evidence of repeated diagnosis.

## Monitoring decision

The historical statement-only amend-and-resubmit rate for the new rules was 7/20 (**35%**), above the ratified 25% threshold. It does **not** trigger a historical rubric change: the cases predate the conventions, and flaky-debug's current `references/plan.md` already requires both `Causal chain` and `Prior attempts`.

Live enforce-mode monitoring is implemented in the flaky-critic skill for the 14-day window starting 2026-07-16 and ending before 2026-07-30:

- denominator: unique gated ticket content-states;
- numerator: amend-and-resubmit markers naming statement-missing B8 or B5 Prior-attempts;
- headline plans are deduplicated when both rules fire, with per-rule attribution retained;
- more than 25% at window close invokes `cb-work` for the narrowest flaky-debug plan-producing source, with a linked implementation ticket as fallback, never a weaker gate;
- any systematic substantive false-reject pattern triggers a Rocky-approved rubric amendment proposal regardless of rate.
- claim and action leases plus a pre-creation ownership recheck prevent overlapping finalizers from creating duplicate work;
- the final digest and action links are persisted on STAFF-1818 with `<!-- flaky-critic: b8-prior-monitoring-finalized -->` so later runs do not repeat finalization.

## What this establishes

The run confirms that both new rules are mechanically checkable and that the statement-vs-substance split is essential. It also shows that the recent historical corpus is a poor raw agreement benchmark for the current full rubric: the plans predate several required fields, and most negative outcomes are weak labels.

It does not establish that B8 or Prior-attempts should be weakened, nor does it validate the live bounce rate. The ratified two-week enforce-mode monitoring window is the relevant evidence for planner-template propagation and live substantive false rejects.

## Case ledger

| Case | Source                                                                           | Human   | Label  | Critic | B8          | Prior-attempts |
| ---- | -------------------------------------------------------------------------------- | ------- | ------ | ------ | ----------- | -------------- |
| 01   | [admin #7373](https://github.com/ClipboardHealth/cbh-admin-frontend/pull/7373)   | reject  | strong | reject | statement   | none           |
| 02   | [backend #26392](https://github.com/ClipboardHealth/clipboard-health/pull/26392) | approve | strong | reject | substantive | none           |
| 03   | [admin #7559](https://github.com/ClipboardHealth/cbh-admin-frontend/pull/7559)   | approve | strong | reject | statement   | substantive    |
| 04   | [mobile #12521](https://github.com/ClipboardHealth/cbh-mobile-app/pull/12521)    | reject  | weak   | reject | substantive | substantive    |
| 05   | [admin #7282](https://github.com/ClipboardHealth/cbh-admin-frontend/pull/7282)   | approve | strong | reject | substantive | none           |
| 06   | [mobile #12635](https://github.com/ClipboardHealth/cbh-mobile-app/pull/12635)    | approve | strong | reject | statement   | none           |
| 07   | [admin #6824](https://github.com/ClipboardHealth/cbh-admin-frontend/pull/6824)   | reject  | weak   | reject | statement   | none           |
| 08   | [admin #7390](https://github.com/ClipboardHealth/cbh-admin-frontend/pull/7390)   | approve | strong | reject | substantive | none           |
| 09   | [mobile #12496](https://github.com/ClipboardHealth/cbh-mobile-app/pull/12496)    | approve | strong | reject | statement   | none           |
| 10   | [admin #7380](https://github.com/ClipboardHealth/cbh-admin-frontend/pull/7380)   | reject  | weak   | reject | substantive | none           |
| 11   | [admin #7336](https://github.com/ClipboardHealth/cbh-admin-frontend/pull/7336)   | approve | strong | reject | substantive | substantive    |
| 12   | [mobile #12633](https://github.com/ClipboardHealth/cbh-mobile-app/pull/12633)    | approve | strong | reject | statement   | none           |
| 13   | [admin #6974](https://github.com/ClipboardHealth/cbh-admin-frontend/pull/6974)   | reject  | weak   | reject | none        | statement      |
| 14   | [admin #7374](https://github.com/ClipboardHealth/cbh-admin-frontend/pull/7374)   | approve | strong | reject | substantive | none           |
| 15   | [admin #7596](https://github.com/ClipboardHealth/cbh-admin-frontend/pull/7596)   | approve | strong | reject | statement   | statement      |
| 16   | [mobile #12270](https://github.com/ClipboardHealth/cbh-mobile-app/pull/12270)    | reject  | weak   | reject | substantive | none           |
| 17   | [admin #7250](https://github.com/ClipboardHealth/cbh-admin-frontend/pull/7250)   | approve | strong | reject | substantive | none           |
| 18   | [admin #7370](https://github.com/ClipboardHealth/cbh-admin-frontend/pull/7370)   | approve | strong | reject | substantive | substantive    |
| 19   | [admin #7320](https://github.com/ClipboardHealth/cbh-admin-frontend/pull/7320)   | approve | strong | reject | substantive | none           |
| 20   | [admin #7386](https://github.com/ClipboardHealth/cbh-admin-frontend/pull/7386)   | approve | strong | reject | statement   | substantive    |
