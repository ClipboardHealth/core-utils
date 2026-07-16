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
2. **B-rules first** (any violation → reject): B1–B8, per rubric §2. For B5 in shadow/enforce mode, compare the plan's mechanism with candidate KB entries. In backtest mode, make that comparison only when a contemporaneous entry is part of the supplied snapshot. Reject substantively when an eligible entry documents that the same proposed mechanism already merged and then recurred; a shared symptom signature without a matching mechanism is not enough.
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
<!-- flaky-critic: verdict=reject mode=enforce -->
```

- **enforce**: approve → move the ticket to Todo and assign it to the Linear API user. Reject → comment and leave in Triage; the investigating flow gets one bounce. A second reject on the same ticket → comment `needs-human` and stop touching it.
- **shadow**: comment only, prefixed `[shadow]`, marker `mode=shadow`.
- **needs-human**: comment with what the rubric cannot answer; never move the ticket.

## Phase 4: Taste capture

When you encounter a ticket where a human's action contradicts your prior verdict (you rejected, they released; you approved, they bounced), post a follow-up comment containing a drafted rubric amendment — the rule change that would have made your verdict match theirs — marked `<!-- flaky-critic: amendment-proposal -->`. The human approves or discards; you never edit the rubric yourself.

## Phase 5: Digest

End with: tickets reviewed, verdicts by type with rule-ID counts, agreement events observed (human actions vs prior verdicts), amendment proposals drafted, and tickets skipped as already-current. When run as a recurring task, this digest is the run's final message.

## PR checkpoint (when the task description asks for it)

Sweep open pipeline-authored flaky-fix PRs the same way, using the rubric's diff-level detection heuristics: B-rule patterns on the diff itself, the claimed A-class's required evidence in the PR body, attempt-to-fix key present, current-main status stated (B7). Review comment only, in every mode. Never merge; merge rights are out of scope.

When posting PR feedback, follow `../simple-review/references/posting-pr-review.md`: use one GitHub Review with event `COMMENT`, anchor actionable comments to changed lines, and keep approval decisions for humans.
