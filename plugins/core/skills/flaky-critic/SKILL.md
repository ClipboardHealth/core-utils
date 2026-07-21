---
name: flaky-critic
description: Adversarial reviewer for flaky-test fix plans and PRs, enforcing the flaky-fix rubric. Gates implementation tickets from Triage to Todo (enforce by default; approve releases, reject bounces; canceling tickets stays human-only). Use when running the recurring flaky-critic task, when asked to review a flaky-fix plan or PR against the rubric, or to backtest verdicts against historical tickets.
---

The quality gate of the flaky-test pipeline. Implementation tickets created by investigation agents land in the **Triage** state; this skill reviews each plan against `references/rubric.md` and decides whether it dispatches. It replaces per-plan human review; the human sees only disagreements, bounces, and the audit sample.

Your job is adversarial: assume the plan papers over the root cause until its evidence proves otherwise. You route and gate — you never redesign the fix yourself.

## Modes

- **enforce** (default): act on verdicts per Phase 3 — approve releases, reject bounces. Canceling tickets is out of scope: cancel is not in the verdict vocabulary, and no shadow evidence backs it. Promoted from shadow 2026-07-06 after the shadow-agreement measurement (approve 38/41 with all misses strategy/bulk sweeps; reject 6/8 with both overrides format-level rejects).
- **shadow**: post the verdict comment only, prefixed `[shadow]`; never change ticket state. Use only when the task description says shadow, for re-measurement of agreement.
- **backtest**: verdicts on historical plans provided as files or ticket IDs; write nothing anywhere. Judge ONLY from the plan content — never look up ticket states, comments after the plan, linked PRs, or how things actually resolved.

## Rules

- Load `references/rubric.md` (relative to this SKILL.md) before judging anything. Every rejection MUST cite rule IDs and quote the offending plan sentence or diff hunk. Every approval MUST name the fix class (A1–A7, C1–C5, D1–D5) and the evidence that satisfies its requirements.
- In shadow/enforce mode, consult `../flaky-debug/references/root-cause-kb/README.md` for the plan's symptom signature and proposed mechanism, and read every plausible entry before applying B5's Prior-attempts rule. A KB entry's **What failed and why** section may supply substantive evidence that the proposed mechanism was already tried and failed; cite the entry and its linked recurrence evidence, not the index row alone. In backtest mode, do not open the live KB; use KB evidence only when the supplied historical snapshot includes the contemporaneous entry.
- Before treating a deployed-service sighting as D3 or failed-fix evidence, apply
  `../flaky-debug/references/deployment-aware-recurrence.md`. Missing runtime
  provenance is `observability-blocked`, not permission to infer from merge
  time.
- One verdict per ticket per content-state: skip tickets whose latest `<!-- flaky-critic:` marker is newer than the last substantive edit/comment.
- Findings from automated reviewers (Mendral, CodeRabbit) are advisory inputs, never binding (rubric §1).
- A plan outside the rubric's taxonomy is **needs-human**, not a guess. Uncertainty bounces up, never through.
- Verdicts are about the plan in front of you; do not penalize brevity when the required evidence is present, and do not reward thoroughness that lacks it.

## Phase 1: Queue (shadow/enforce only)

Linear: Groundcrew project, label `flaky-implementation`, state `Triage`. Skip already-marked tickets per the rule above. For shadow/enforce runs, fetch the linked investigation ticket (the plan's evidence usually lives there) and note any linked PRs. Use `list_issues` only to enumerate; fetch plan content with `get_issue` — list results truncate descriptions.

In backtest mode, skip the live queue and linked metadata lookups. Use only the supplied historical plan content or ticket snapshot; do not fetch linked investigation tickets, linked PRs, current ticket state, comments after the plan, or how the work actually resolved.

If the queue is empty, skip to the digest. Fetch linked investigation tickets and linked PR metadata in parallel when the available tooling supports it.

## Phase 2: Verdict per ticket

1. **Classify** the proposed fix into the rubric taxonomy. Multi-part plans get classified per part; the worst verdict wins.
2. **B-rules first** (any violation → reject): B1–B8, per rubric §2. For B5 in shadow/enforce mode, compare the plan's mechanism with candidate KB entries. In backtest mode, make that comparison only when a contemporaneous entry is part of the supplied snapshot. Apply the shared deployment-aware contract to deployed-service recurrence evidence. If that evidence is `observability-blocked`, reject for amendment under `B5-prior-attempts`.
3. **A/C requirements**: the named fix class's "Required evidence" must be present (A-rules), or the conditional justification stated verbatim (C-rules). A1 has a shared-helper carve-out that's easy to miss — check it explicitly before approving.
4. **D dispositions**: a no-code plan must carry the disposition's required evidence (D1–D5).
5. **Verdict**: `approve` / `reject` / `needs-human`, with confidence high/moderate/low. Low confidence → needs-human.

## Phase 3: Act

Post the verdict comment on the implementation ticket:

```text
VERDICT: reject — B2, B6
- B2: "increase the navigation timeout to 30s" — timeout inflation without a root-cause statement of why the operation is legitimately slow.
- B6: plan states confidence 3/5 but has no observability-to-reach-5/5 section.
Fix class claimed: A1 (readiness gate). Missing required evidence: polled signal is not shown to be the one the failing UI path uses.
<!-- flaky-critic: verdict=reject mode=enforce disposition=substantive-reject statement-missing=B6 substantive=B2 -->
```

- Every verdict marker must record `disposition`, `statement-missing`, and `substantive`. Use comma-separated rule tokens and `none` when a bucket is empty. Distinguish B5's checks as `B5-dedup` and `B5-prior-attempts`; use the normal rule ID for every other rule. Use these dispositions:
  - approve: `verdict=approve disposition=release statement-missing=none substantive=none`;
  - statement-only reject: `verdict=reject disposition=amend-and-resubmit`;
  - any demonstrated violation: `verdict=reject disposition=substantive-reject`;
  - low-confidence or out-of-taxonomy escalation: `verdict=needs-human disposition=needs-human`;
  - second reject on revised content: `verdict=needs-human disposition=second-reject`.
- **enforce**: approve → move the ticket to Todo and assign it to the Linear API user. Reject → comment and leave in Triage; the investigating flow gets one bounce. A second reject on the same ticket → comment `needs-human` and stop touching it.
- **shadow**: comment only, prefixed `[shadow]`, marker `mode=shadow`.
- **needs-human**: comment with what the rubric cannot answer; never move the ticket.

## Phase 4: Taste capture

When you encounter a ticket where a human's action contradicts your prior verdict (you rejected, they released; you approved, they bounced), post a follow-up comment containing a drafted rubric amendment — the rule change that would have made your verdict match theirs — marked `<!-- flaky-critic: amendment-proposal -->`. The human approves or discards; you never edit the rubric yourself.

## Phase 5: Digest

End with: tickets reviewed, verdicts by type with rule-ID counts, agreement events observed (human actions vs prior verdicts), amendment proposals drafted, tickets skipped as already-current, and the monitoring block below. When run as a recurring task, this digest is the run's final message.

### B8 and Prior-attempts monitoring

Monitor the first 14 days after both rules are live: **starting 2026-07-16 and ending before 2026-07-30**. During the window, query Groundcrew `flaky-implementation` tickets updated on or after 2026-07-16 across all states and read their full comments; list results and the current queue are not a cumulative data source. Recompute the window from `mode=enforce` critic markers so the result survives separate sessions.

On or after 2026-07-30, coordinate finalization on STAFF-1818 with deterministic run key `2026-07-16--2026-07-30`:

Only honor coordination markers authored by the configured Linear API user that runs flaky-critic. Read authorship and creation time from Linear's server-provided comment metadata; embedded `claimed-at` and `lease-until` values are descriptive, not authority. Ignore markers from other authors, markers with a mismatched run key, future-dated markers, and leases whose server creation time plus the documented duration has expired. For linked GitHub or Linear actions, also require the expected repository or project, exact title suffix, run key, and an artifact author/creator attributable to the same trusted automation.

1. If a trusted `<!-- flaky-critic: b8-prior-monitoring-finalized run=2026-07-16--2026-07-30 -->` is present, omit this monitoring block.
2. Otherwise post `<!-- flaky-critic: b8-prior-monitoring-claim run=2026-07-16--2026-07-30 claimed-at=<ISO timestamp> -->`, then re-read all comments. The earliest trusted non-stale claim by server creation time wins; later claimants stop. A claim is stale 60 minutes after its server creation time when no trusted action or finalized marker exists, allowing a later run to take over.
3. Before creating side effects, search STAFF-1818 comments, Linear tickets, and GitHub PRs for a trusted `<!-- flaky-critic: b8-prior-monitoring-action run=2026-07-16--2026-07-30 -->`. Reuse the validated linked action when present.
4. When a new action is required, the claim winner posts `<!-- flaky-critic: b8-prior-monitoring-action-started run=2026-07-16--2026-07-30 owner=<claim comment ID> lease-until=<ISO timestamp> -->` with a four-hour lease, then re-reads STAFF-1818. The earliest trusted unexpired action lease wins; later action starters stop. Calculate expiry from the server creation time, require `owner` to reference the winning trusted claim, and treat renewals as new trusted comments from that owner. Renew before invoking `cb-work` and at least every three hours while work continues.
5. Revalidate trusted ownership and repeat the action search immediately before any PR or ticket creation. Search-and-re-read is a secondary guard, not the uniqueness mechanism: the creator must use a server-enforced idempotency key or unique external ID derived from the run key. For GitHub, use deterministic head branch `flaky-critic-monitoring/2026-07-16--2026-07-30`; if branch or PR creation reports that it already exists, look up and reuse the existing PR. A Linear fallback ticket may be created only when the available creator provides an atomic idempotency or uniqueness facility; otherwise post `needs-human` on STAFF-1818 instead of risking a duplicate. The `cb-work` request must carry these requirements through its shipping step. Any new PR or ticket must carry the action marker, an exact `STAFF-1818 monitoring` title suffix, and the deterministic run key. A takeover is allowed only after the prior trusted action lease expires with no validated action marker.
6. Run the final aggregation and complete any threshold or amendment action below. Post the final digest and all action links to STAFF-1818 with the finalized marker. Write it only after required actions exist.

- **Denominator — gated plans:** one verdict marker per unique ticket content-state in the window, including approve, reject, and needs-human. Exclude shadow/backtest verdicts, PR-checkpoint comments, and already-current skips. The one-verdict-per-content-state rule makes each marker one denominator event.
- **Numerator — statement-missing bounces:** gated plans whose marker has `disposition=amend-and-resubmit` and names `B8` or `B5-prior-attempts` in `statement-missing`. Count a plan once in the headline numerator even when both rules fired; also report per-rule attribution, where one plan may count under both.
- **Substantive rejects:** report `B8` and `B5-prior-attempts` substantive counts separately. When a human later releases one, compare the cases by mechanism. Any systematic substantive false-reject pattern, regardless of rate, requires a concrete rubric amendment proposal for Rocky's approval using `<!-- flaky-critic: amendment-proposal -->`; never edit or weaken the rubric silently.
- **Harness-contract watch:** record every plan that invokes B8's harness-contract terminus, including whether the critic accepted an evidenced contract or rejected a generic detach, timeout, 401, or retry-success symptom as laundering. Compare later human outcomes for both accepted and rejected cases. Report any repeated stretch pattern in the substantive-pattern finding; do not broaden the exception from monitoring evidence without Rocky's per-PR approval.
- **Threshold:** report the cumulative statement-missing numerator, denominator, percentage, and per-rule attribution as provisional during the window. When the denominator is zero, report `N=0`, omit the percentage as not evaluable, and do not trigger a breach. At the window close, **more than 25%** triggers a fix-forward change in the narrowest flaky-debug plan-producing source: normally `references/plan.md` for a missing output field, or `SKILL.md` when the investigation flow failed to collect the required evidence. `plan-e2e.md` and `plan-fast-path.md` already converge on the shared output template; do not duplicate requirements across them. Invoke `core:cb-work`/`cb-work` against `ClipboardHealth/core-utils` with the observed omission and required template change; if that workflow is unavailable, create a linked Groundcrew implementation ticket only through the atomic uniqueness path above. Include the resulting PR or ticket link in the final digest before writing the finalization marker. Do not change B8 or the Prior-attempts gate to reduce the rate.

Use this digest shape:

```text
New-rule monitoring (2026-07-16..<2026-07-30):
- gated plans: N
- statement-missing amend-and-resubmit: N — rate: P% | not evaluable (when gated plans=0) — B8: N, B5-prior-attempts: N
- substantive rejects — B8: N, B5-prior-attempts: N
- harness-contract terminus watch: N invoked — accepted: N, laundering rejects: N, human reversals: N
- threshold: provisional | pass | breached — <fix-forward action or "none">
- substantive false-reject patterns: <amendment proposal links or "none observed">
```

## PR checkpoint (when the task description asks for it)

Sweep open pipeline-authored flaky-fix PRs the same way, using the rubric's diff-level detection heuristics: B-rule patterns on the diff itself, the claimed A-class's required evidence in the PR body, attempt-to-fix key present, current-main status stated (B7). Review comment only, in every mode. Never merge; merge rights are out of scope.

When posting PR feedback, follow `../simple-review/references/posting-pr-review.md`: use one GitHub Review with event `COMMENT`, anchor actionable comments to changed lines, and keep approval decisions for humans.
