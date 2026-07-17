---
name: flaky-closeout
description: Sweep the flaky-test pipeline after fixes merge by closing out the root-cause KB, closing clearly superseded tickets as Done under D3, and re-dispatching critic-rejected plans for amendment. Use for the recurring flaky close-out task, a post-merge flaky-fix sweep, or a dry-run/backtest of close-out decisions.
---

<!-- cspell:ignore backtest backtesting groundcrew redispatch worktree -->

# Flaky Closeout

Run three post-merge sweeps in one read-first, write-later pass. This stage
maintains the pipeline's learning and dispatch loops; it does not diagnose new
root causes or implement product fixes.

Read these files before deciding or writing:

- `../flaky-debug/references/fix.md` for the KB close-out contract.
- `../flaky-debug/references/root-cause-kb/README.md` and every plausible KB
  entry.
- `../flaky-critic/SKILL.md` and its rubric for D3, marker, and second-reject
  semantics.
- `../create-groundcrew-ticket/SKILL.md` for dispatch eligibility.
- `../blind-backtest/SKILL.md` when running `--backtest`.
- [Comment templates](./references/comment-templates.md) before posting.

## Invariants

- Never cancel a ticket. Cancel authority remains human-only.
- Close a superseded ticket as **Done**, not Canceled or Duplicate. Done enters
  the 21-day verifying window so the recurrence loop can reopen a false
  supersession.
- Require a clear mechanism match before D3 closure: the same KB entry or
  causal mechanism **and** the same failure-signature class.
- Decide the complete action ledger before any external write.
- Search existing comments for the exact marker before every write. A marker is
  a lease for that action, not a substitute for checking current state.
- Batch all KB changes from one run into one focused `core-utils` PR. Never
  commit directly to the default branch and never auto-merge.
- Do not schedule or re-arm this skill. When invoked by a recurring task, follow
  re-arm instructions from the task description only after the digest.

## Modes and window

Support these modes:

- **Production:** perform reads, build the ledger, then write.
- **`--dry-run`:** perform every read and decision, but make no Linear, GitHub,
  git, or repository write. Print the exact proposed comments, state changes,
  and KB diff plan. Represent the unavailable KB PR URL as
  `<future KB PR for run <run-key>>`.
- **`--backtest`:** imply `--dry-run` and follow `../blind-backtest/SKILL.md`.
  Freeze the requested historical cutoff and keep judgments isolated from the
  answer key. If separate assembler and judge contexts are unavailable, stop
  and report that the blind protocol cannot be satisfied.

Before the first production run for a new rule revision, run a backtest and a
current dry run as separate invocations. Do not promote from historical results
alone.

Use an explicit `--since` value or the last successful-run timestamp supplied
by the recurring task, subtracting three days for overlap. If neither exists,
look back 21 days. Accept `--bounce-age-days`; default to 3. Print the effective
window, overlap, cutoff, and bounce age in the digest.

## Phase 1: Build the source manifest

Start these independent discovery reads concurrently:

- primary merged-PR search;
- missing-label Linear fallback;
- non-terminal flaky-ticket universe;
- bounced-ticket queue.

After discovery, deduplicate ticket IDs and fetch each full issue and comment set
once. Cache the records for the entire run.

### Merged-fix manifest

Search merged PRs across the `ClipboardHealth` organization:

1. Primary source: every merged PR carrying `flaky-test-fix` in the effective
   window. Paginate; do not trust a single result page.
2. Label-hygiene fallback: recent `flaky-implementation` and chronic deep-dive
   tickets whose linked PR merged in the window and demonstrably fixed a flaky
   mechanism, even when the PR omitted the label. Require the PR body or Linear
   attachment to identify the source ticket. Record a missing-label digest
   risk; do not mutate PR labels.
3. Exclude closed-unmerged PRs. Deduplicate by repository and PR number.

Build a cheap first-pass PR record:

- repository, PR URL, merge timestamp, merge commit, title, and labels;
- source Linear ticket ID from the PR body or attachment;
- cached source ticket ID and related-ticket IDs.

Hydrate changed files, diff, detailed validation evidence, and full related
tickets only after a pending KB close-out or plausible D3 join makes the PR
actionable. From the hydrated records, extract `KB match:`, pending
`Knowledge-base close-out`, causal mechanism, signature class, validation
evidence, and every flake sighting timestamp.

If a PR lacks a source ticket ID, report it as unresolved and take no close-out
action for it.

### Bounce manifest

List `flaky-implementation` tickets in Triage. Fetch each issue and all comments;
list results truncate descriptions.

Keep a ticket only when it has:

- a critic marker with `mode=enforce` and `verdict=reject`; current markers also
  carry `disposition=amend-and-resubmit` or
  `disposition=substantive-reject`, while legacy markers may omit disposition;
- a verdict older than the bounce-age threshold;
- no later plan amendment that addresses the verdict;
- no completed close-out re-dispatch for that verdict.

Use the verdict comment ID when available; otherwise use its timestamp. A later
issue edit is only a possible amendment: read the current plan and confirm that
it addresses each cited rule before skipping re-dispatch.

Treat `verdict=needs-human disposition=second-reject` as terminal
`needs-human`. Also classify two enforce-mode rejects separated by a plan
amendment as `needs-human` when processing older marker formats. Never
re-dispatch either case; include it in the digest for Rocky.

A re-dispatch marker on a ticket that is still Groundcrew-ineligible means
`eligibility mutation pending`, not `skip`. Resume only the missing eligibility
changes; do not post the comment again.

Phase 1 is complete only when every manifest item has full ticket descriptions
and comments. Do not decide against truncated list results.

## Phase 2: Sweep KB close-outs

Inspect both the source ticket and related or superseded implementation tickets.
A pending close-out can live on a different fingerprint family than the PR that
fixed its mechanism.

For every pending close-out:

1. Confirm the target PR merged. If not, leave it pending and report it.
2. Resolve the plan's `KB match:` to an existing entry. If the plan says none,
   create a new entry only when the evidenced causal terminus is genuinely new.
3. Compare the plan, merged diff, validation, and related recurrence. Prepare
   the required dry-run statement from `flaky-debug/references/fix.md`.
4. Record:
   - the recurrence or variant addressed;
   - the landed fix and PR;
   - any newly established partial or failed-scope lesson;
   - affected repository/surface, evidence, current status, and `Last reviewed`;
   - symptom-index changes only when the new signature is more discriminating.
5. Deduplicate updates by KB entry and mechanism. One PR can close several
   tickets; one KB entry should receive one coherent edit.

Use this completed-action marker only after the focused KB PR exists:

```html
<!-- flaky-closeout: kb-done pr=<full-core-utils-pr-url> -->
```

After the action ledger is complete, sort each KB action as
`<entry-path>|<source-PR>|<affected-ticket-IDs>` and hash the resulting list.
Derive the run key from the recurring task's scheduled occurrence ID or exact
UTC cutoff timestamp plus the first 12 characters of that ledger hash. Use
deterministic branch `flaky-closeout/<run-key>` and put this marker in the PR
body:

```html
<!-- flaky-closeout: kb-run=<run-key> ledger=<full-hash> -->
```

Before creating a branch or PR, search that exact head branch. Reuse an open or
merged PR only when its trusted PR-body marker has the same run key and full
ledger hash. A different ledger always gets a different run key, even on the
same day. This verified PR lookup is the idempotency key when a prior run
created the KB PR but failed before commenting on every ticket.

In production, create a fresh `core-utils` worktree on that branch, apply every
recorded KB edit, run `node --run sync-ai-rules` and `node --run verify` with the
repository Node version, and ship one PR through the repository's
`cb-work`/`cb-ship` workflow. Link the PR in a close-out comment on every
affected ticket. If the PR cannot be created, do not post the marker; report
the failure and leave the close-out retryable. If the PR exists, reuse it and
retry only missing ticket comments.

## Phase 3: Sweep supersessions under D3

From the Phase 1 cache, build indexes over every non-terminal ticket labeled
`flaky-investigation` or `flaky-implementation`: normalized KB entry, causal
mechanism, signature class, source PR, and fingerprint family. Join every
merged fix against those indexes. Do not limit the join to the source
fingerprint family and do not repeat the organization-wide ticket scan per PR.

Use the KB mechanism as the cross-family join key:

1. Resolve each candidate's `KB match:` line. If it has no line, require
   equivalent explicit causal evidence in its plan; text similarity alone is
   insufficient.
2. Confirm the merged PR fixes the same causal locus, not merely a nearby
   symptom.
3. Confirm the signature class matches, such as provider-topology remount,
   query-row overlay teardown, Cognito alias lookup, or CDC readiness.
4. Parse the candidate's earliest relevant sighting timestamp and prove it is
   earlier than the PR merge timestamp. If no reliable sighting time exists, do
   not close.
5. Check that the ticket has no post-merge recurrence for that mechanism.

Classify the candidate:

- **Clear match:** stage the D3 comment from
  [comment templates](./references/comment-templates.md), then set the ticket to
  Done. Include the PR, mechanism, sighting and merge timestamps, 21-day
  verifying window, and recurrence-loop reopen safety net.
- **Ambiguous:** stage one possible-supersession comment tagging Rocky and leave
  state unchanged.
- **No match:** take no action.

Markers:

```html
<!-- flaky-closeout: superseded-by=<full-source-pr-url> -->
<!-- flaky-closeout: possible-supersession pr=<full-source-pr-url> -->
```

Post the clear-match comment before setting Done. If the state update fails,
retain the comment marker and retry only the missing state change on the next
run. A supersession marker on a still-open ticket therefore means
`state-change pending`, not `skip`. Never change a ticket to Canceled.

## Phase 4: Sweep bounced plans

For each eligible first-bounce ticket:

1. Quote the decisive critic verdict and rule IDs.
2. State the exact plan amendment required; do not propose the implementation
   fix yourself.
3. Validate every field against the eligibility contract in
   `../create-groundcrew-ticket/SKILL.md`.
4. Post the re-plan instruction with the verdict-specific marker, then make only
   the state, assignee, and label changes required to restore eligibility. Do
   not rewrite repository, parent, or blocker semantics.

Do not re-dispatch when a later plan already addresses the verdict, the same
verdict marker exists, or this is the second bounce. Leave second bounces in
Triage and list them as `needs-human`.

## Phase 5: Execute and verify

In production, execute the already-decided ledger in this order:

1. Create the single KB PR and add KB close-out comments.
2. Post D3 or possible-supersession comments and apply D3 state changes.
3. Post bounce instructions and restore Groundcrew eligibility.

Execute each ticket's ordered mutation bundle, then refetch it once. Verify only
the marker, state, assignee, labels, relations, and linked PR fields that bundle
could change. Preserve individual mutation failures in the ledger so the next
run can reconcile marker versus state. Continue independent actions after one
failure, but never claim a failed action succeeded.

In dry-run or backtest, print the same ordered ledger with exact comment bodies
and state mutations, prefixed `WOULD`; write nothing.

## Phase 6: Digest

End with:

- effective window, mode, merged PR count, source-ticket resolution count, and
  missing-label fallbacks;
- KB entries and tickets updated, pending, skipped by marker, and KB PR URL;
- D3 closed, possible supersessions, no-match candidates, and state failures;
- bounce candidates, re-dispatched, already amended, marker-skipped, and
  needs-human;
- every ambiguity, missing timestamp, missing ticket ID, incomplete evidence,
  or failed write.

When backtesting, use the blind-backtest output contract. See the checked-in
[2026-07-17 acceptance report](./references/acceptance-report-2026-07-17.md).
It records a targeted historical check, not a reusable backtest fixture or
approval for future live rule revisions.
