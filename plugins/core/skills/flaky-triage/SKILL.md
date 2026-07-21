---
name: flaky-triage
description: Scheduled triage stage between flake-intake and agent dispatch. Clusters flaky-investigation tickets by shared root cause, closes duplicates and infra blips, and releases one repository-owned canonical ticket per cluster for dispatch. Use when running the recurring flaky-triage task, when asked to triage the flaky queue, or to backtest clustering against historical tickets.
---

The pipeline stage between flake-intake (deterministic, string-level collapse: bursts and storms) and per-ticket dispatch. Intake creates investigation tickets in the **Triage** state, where groundcrew ignores them. This skill clusters them semantically — same root cause, even when error text differs — then performs ticket surgery and releases exactly one dispatchable ticket per root cause and implementation repository.

This skill routes and classifies known mechanisms from existing ticket evidence; it never performs a new source-level diagnosis. Do not propose fixes, read test source files, or run flaky-debug. Diagnosis happens later, on the released ticket, through the normal dispatch flow.

## Rules

- One repository-owned canonical ticket per root cause, never one per sighting within an implementation repository (rubric B5).
- One implementation ticket per mechanism cluster per repository. A cross-repo mechanism match coordinates repository-owned fixes; it never consolidates them across repositories.
- Never hold a ticket hostage: anything you cannot confidently cluster is released as a singleton. The worst case must equal the no-triage baseline.
- Load `../flaky-critic/references/rubric.md` before citing close-out rules. Cite rubric rule IDs (B5, D1, D2, D3) in every close-out comment.
- Decide the full cluster picture before writing anything to Linear.
- Keep bulky data in local scratch files; keep only the manifest and decisions in context.
- All Linear writes are idempotent. Use exact markers only to deduplicate comments. Immediately before state, label, relation, or marker-comment writes, re-read the current value and skip only when the desired state, label, relation, or exact marker already exists.
- Production Linear writes are single-flight. The recurring task or caller must serialize the entire Phase 4 write pass; if exclusive execution cannot be established, remain in dry-run and report the blocker. After an API conflict, re-fetch the affected tickets and retry only actions that are still missing.

**Rubric IDs** (cite the matching ID in every close-out comment):

- **B5** — one repository-owned canonical ticket per root cause, never one per sighting within an implementation repository.
- **D1** — infra/environment incident: cancel with incident window + correlation evidence + why no code fix applies + re-arm note.
- **D2** — duplicate of canonical: matching evidence + no new implementation ticket needed beyond the canonical.
- **D3** — already-fixed: matches an investigation/implementation ticket closed in the last 14 days.

## Phase 1: Queue

Fetch candidate tickets from Linear: project `Groundcrew`, label `flaky-investigation`, state `Triage`. (During migration, also include state `Todo` with no assignee.) A marker is not enough to skip a ticket: verify that its promised disposition is reflected in the issue state and relations. If a marked ticket remains in the queue, treat it as a partial action, reconstruct the intended disposition, skip completed writes, and resume the rest. If the queue is empty, skip to the digest.

Use `list_issues` only to enumerate the queue; fetch each candidate with `get_issue` — list results truncate descriptions and will silently drop the Flake details JSON. Fetch candidate details in parallel when the available tooling supports it.

Build one manifest row per ticket from its Flake details JSON: `issueId`, `repo`, `framework`, `testFile`, `testName`, `suite` (top-level describe / file basename family), `firstErrorLine`, `firstProjectStackFrame`, `pipelineUrl`, `commit`, `timestamps`, `priorTickets` (from the Prior Related Tickets section). Storm (`[storm:`) and burst (`[burst:`) tickets are pre-clustered by intake: treat each as a single-member cluster and release it; never merge them into other clusters.

Phase 1 is done when every non-skipped candidate has a manifest row — don't carry a partial manifest into Phase 2.

## Phase 2: In-flight context

Fetch what is already being worked, to catch duplicates before they spawn plans. Scope searches to the repos, files, normalized errors, helper names, and prior tickets from the Phase 1 manifest first; widen only when the scoped search leaves a plausible duplicate unresolved.

- Open Linear tickets labeled `flaky-implementation` (any state but terminal). Collect plausible IDs first, then fetch each with `get_issue` and read its comments in parallel when the available tooling supports it; list results truncate the plan, `KB match:` statement, critic approval, and PR context needed for mechanism coordination.
- PRs: search `flaky-test-fix` in both `open` and `closed` states; treat closed-unmerged siblings as duplicate signals, not already-fixed proof. Also try title keywords `flaky`/`deflake`.
- Open `[storm:` / `[burst:` tickets and their contained fingerprints.
- Investigation/implementation tickets closed in the last 14 days, for already-fixed matches only after confirming the merged fix is on main and the sighting predates it (D3).

Check all four sources before Phase 3 — a cluster decided against partial in-flight context can't be trusted.

## Phase 3: Cluster

Normalize first-error lines before comparing: replace UUIDs, emails, names, phone numbers, IDs, ObjectIds, hashes, ports, and timestamps with placeholders; collapse generated asset names; keep HTTP status codes, helper names, endpoint paths, and lifecycle stages intact.

Cluster by strongest shared evidence first:

1. Same CI run / commit / tight timestamp window plus same setup or helper stack.
2. Same failure surface: CI/job setup, test setup/auth/data, app bootstrap, backend request, post-success render, assertion/locator.
3. Same first project stack frame or shared setup helper.
4. Same endpoint / static asset / status-code pattern.
5. **Same module mechanism:** sibling tests in one file family or suite exercising the same logic class — e.g., several boundary/threshold tests of one module failing on timing, or several tests of one dialog failing on the same interaction — even when assertion messages differ. Name the shared mechanism explicitly; "same file" alone is insufficient.
6. Shared prior related tickets.
7. **Same environment incident:** multiple otherwise-distinct clusters whose failures all reduce to backend 5xx in seed/setup/readiness helpers within the same few minutes, across ≥2 repos or ≥3 pipelines. Different helpers and error text do not separate them — one staging outage surfaces through every helper that touches it. Merge them into one incident cluster (backtest lesson: 2026-06-09's 13 tickets were four helper-level clusters but one incident).

Do not merge clusters merely because failures share a run. Same-run failures can have different root causes.

### Knowledge-base mechanism coordination

Finish the root-cause clusters above before this second pass. Same-repo duplicate decisions take precedence; knowledge-base coordination must not rescue a duplicate or split one root cause into several tickets. Before the lookup, use the Phase 4 rules and chronic threshold to plan every disposition without writing to Linear.

For every canonical that the plan would release, plus every plausibly related in-flight implementation ticket from Phase 2:

1. Open `../flaky-debug/references/root-cause-kb/README.md` once. Compare every member's failure signature, failure surface, and available causal evidence with the symptom index, collect the union of plausible entries, then read each unique entry once in full, including **What failed and why**.
2. For each matched entry, widen the Phase 2 in-flight search across repositories using the entry link, entry title, and mechanism terms. Fetch every non-terminal `flaky-implementation` match before deciding the mechanism cluster.
3. Record one of the exact `KB match:` statements defined in `../flaky-debug/SKILL.md` Phase 1b, including the failed fixes to avoid when an entry matches. Perform the lookup at triage time; do not trust a copied or stale plan line.
4. Group tickets only when the evidence matches the same KB entry and mechanism. A shared symptom without the entry's mechanism is insufficient. Record the entry link, mechanism, ticket IDs, repositories, and whether each member is a provisional canonical or in-flight implementation.

A mechanism cluster exists when at least two surviving provisional canonicals in the run, or one surviving provisional canonical plus an in-flight implementation ticket, match the same entry. The members may represent different fingerprint families. Do not merge members from different repositories, close one as a duplicate of the other, or create a cross-repo canonical. Each repository keeps its own implementation ticket.

When several members are in the same repository, apply the existing root-cause and D2 rules first so at most one canonical per mechanism and repository remains. A KB match alone is not D2 evidence; if the root-cause evidence does not support deduplication, keep the tickets independent and record the ambiguity as a risk instead of forcing them into one mechanism cluster. `KB match: none` cannot establish a production mechanism cluster. Record a likely shared mechanism with no matching entry as a KB gap in risks and in dry-run/backtest output; it does not block either ticket's normal release.

## Phase 4: Plan, coordinate, then act

First, choose exactly one intended disposition per cluster using the ordered rules below. Record the actions without writing to Linear.

1. **Matches in-flight work** — within the same repository, the error family or root cause matches an open implementation ticket or open PR: plan to close every member as Duplicate linked to that canonical and comment citing B5/D2 with the match evidence. Plan no release. A shared KB mechanism alone is not D2 evidence, especially across repositories; handle it through mechanism coordination below.
2. **Matches an open storm/burst ticket** — normalized error matches its signature or contained fingerprints: plan to close members as Duplicate of the storm/burst ticket so late stragglers join the existing event.
3. **Infra blip / environment incident** — an incident cluster (evidence tier 7): use the Phase 3 threshold above. In production runs, corroborate via Phase 2 (Datadog monitor history / error spike through `pup` when available; passed-on-retry signals). Default disposition: plan to close all members as Canceled with a D1 comment. If the incident exposes a hardening gap (e.g., seed path lacks diagnostics), plan to release ONE canonical for that hardening and dup the rest to it — never one per helper.
4. **Same-repository multi-ticket cluster** — within each implementation repository, pick the canonical (richest evidence: most failures, clearest artifacts). Plan to comment the cluster manifest on it: member IDs, shared mechanism, evidence tier from Phase 3, and the marker `<!-- flaky-triage: cluster=<short-slug> -->`. Plan to close only the same-repository members as Duplicate of the canonical (D2 format) and release the canonical. When a non-incident root cause spans repositories, retain one repository-owned canonical per repository and coordinate them as mechanism-cluster peers; never close one repository's ticket as a duplicate of another repository's canonical.
5. **Singleton or uncertain** — plan to release as-is with a brief `<!-- flaky-triage: singleton -->` comment.

After every cluster has an intended disposition, apply the chronic screen described below and act on each knowledge-base mechanism cluster. Finish both gates for the entire run before executing any planned release, cancellation, or duplicate action:

1. Add pairwise Linear `relatedTo` links between all members. Do not add `blockedBy` or `blocks` relations; repository fixes may proceed in parallel.
2. Post a scope-boundary comment on every member. List all peer tickets and repositories, state which repository this ticket owns, and strike any `sibling-repo` step that would create a mirror ticket in a repository owned by a peer. Name the most advanced member as the reference implementation when one has an in-flight PR or a plan with a flaky-critic approval marker. Rank an in-flight PR ahead of an approved plan; if members are equally advanced, tell each to reference the peer plans for mechanism consistency.
3. End each comment with the stable marker `<!-- flaky-triage: mechanism-cluster=<entry-slug> members=<sorted-ticket-ids> -->`. Fetch every member's relations and comments in parallel before writing, then skip each link or comment whose relation or exact marker already exists.

Use this comment shape, substituting the member-specific scope and reference:

```text
Mechanism coordination: STAFF-X and STAFF-Y match KB mechanism <entry>.

Scope: STAFF-X owns <repo-a>. Skip this ticket's sibling-repo step that would create a mirror ticket in <repo-b>; STAFF-Y owns that repository. Reference <ticket/plan/PR> for mechanism consistency. The fixes may proceed in parallel; do not add a blocked-by relation.

<!-- flaky-triage: mechanism-cluster=<entry-slug> members=STAFF-X,STAFF-Y -->
```

For every planned canonical release, search Linear for the fingerprint family with the `flaky-implementation` label across all states and without a date-window restriction, then count unique prior implementation ticket IDs. At **≥3 prior implementation tickets**, remove the planned normal release and leave the canonical in `Triage` unassigned. Create the Linear `chronic` label first if it does not exist. Apply the `chronic` label and route the family to the credential-checked, dossier-first `flaky-deep-dive` skill. Add a ticket comment with the marker `<!-- flaky-triage: chronic -->` and dossier pointers listing every prior implementation ticket ID — but first search the ticket's existing comments for that exact marker and skip posting when it is already present; that absence check is what makes the comment idempotent across retries and re-runs. This ≥3-ticket count is a cheap screen staged before any diagnosis exists; the critic separately applies a sharper **≥2 failed merged fixes** test (see the flaky-critic rubric's Prior-attempts amendment) with the same chronic routing. The thresholds differ by design — by the evidence available at each stage — not by accident.

**Release** = set state to `Todo` and assign to the Linear API user (the viewer). Before release, ensure the ticket satisfies the Groundcrew eligibility contract from `../create-groundcrew-ticket/SKILL.md`: repository text in the description, exactly one `agent-*` label, leaf issue, and no non-terminal blockers unless intentionally blocked. Assignment + Todo is what makes groundcrew dispatch it; it also serves as the lease — released tickets never re-enter the queue.

Only after the chronic and mechanism-coordination gates finish for the entire run, execute the remaining planned dispositions. Preserve the order within each disposition: post its evidence or scope comment and relation first, then change state or release it. Re-read immediately before each write and, after any conflict, resume only the actions still missing.

## Phase 5: Digest

End with a compact report: queue size, cluster count with members and evidence tiers, released / duplicated / canceled / chronic-held counts, in-flight matches found, chronic detections with each canonical ticket and its prior implementation ticket IDs, and risks (possible false merges, missing evidence, KB gaps). Add a dedicated line in this shape: `mechanism clusters: N — <entry>: STAFF-X (<repo-a>), STAFF-Y (<repo-b>); ...`, or `mechanism clusters: 0`. When run as a recurring task, follow any re-arm instructions in the task description after the digest.

## Dry-run and backtest

When invoked with `--dry-run`, when the task description says dry run, or when backtesting: perform Phases 1–4 fully but **write nothing to Linear**. Print each proposed close/release action, chronic-label creation or application, each `relatedTo` link, the exact scope-boundary comment for every mechanism-cluster member, and the mechanism-cluster digest line. Print likely mechanism clusters that lack a shared KB entry as `KB gap` findings, including their members and repositories, but do not count them as production mechanism clusters. For grading, also render the candidate `relatedTo` links and scope-boundary comments that the missing entry prevents, clearly prefixed `not production-eligible: KB gap`.

For a backtest, run blind against the historical tickets you are given. Use only content that existed before the coordination decision; do not read later ticket states, PR outcomes, relations, or human coordination comments until after stating the proposed clusters and actions. Join the result to the human action afterward and report whether member selection, repository ownership, mirror-step removal, and reference-implementation choice agree.
