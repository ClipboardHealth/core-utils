---
name: flaky-triage
description: Scheduled triage stage between flake-intake and agent dispatch. Clusters flaky-investigation tickets by shared root cause, closes duplicates and infra blips, and releases one canonical ticket per cluster for dispatch. Use when running the recurring flaky-triage task, when asked to triage the flaky queue, or to backtest clustering against historical tickets.
---

The pipeline stage between flake-intake (deterministic, string-level collapse: bursts and storms) and per-ticket dispatch. Intake creates investigation tickets in the **Triage** state, where groundcrew ignores them. This skill clusters them semantically — same root cause, even when error text differs — then performs ticket surgery and releases exactly one dispatchable ticket per root cause.

This skill routes; it never diagnoses. Do not propose fixes, read test source files, or run flaky-debug. Diagnosis happens later, on the released ticket, through the normal dispatch flow.

## Rules

- One canonical ticket per root cause, never one per sighting (rubric B5).
- Never hold a ticket hostage: anything you cannot confidently cluster is released as a singleton. The worst case must equal the no-triage baseline.
- Load `../flaky-critic/references/rubric.md` before citing close-out rules. Cite rubric rule IDs (B5, D1, D2, D3) in every close-out comment.
- Decide the full cluster picture before writing anything to Linear.
- Keep bulky data in local scratch files; keep only the manifest and decisions in context.
- All Linear writes are idempotent: skip any action whose marker comment already exists.

**Rubric IDs** (cite the matching ID in every close-out comment):

- **B5** — one canonical ticket per root cause, never one per sighting.
- **D1** — infra/environment incident: cancel with incident window + correlation evidence + why no code fix applies + re-arm note.
- **D2** — duplicate of canonical: matching evidence + no new implementation ticket needed beyond the canonical.
- **D3** — already-fixed: matches an investigation/implementation ticket closed in the last 14 days.

## Phase 1: Queue

Fetch candidate tickets from Linear: project `Groundcrew`, label `flaky-investigation`, state `Triage`. (During migration, also include state `Todo` with no assignee.) Skip tickets that already carry a `<!-- flaky-triage:` marker comment. If the queue is empty, skip to the digest.

Use `list_issues` only to enumerate the queue; fetch each candidate with `get_issue` — list results truncate descriptions and will silently drop the Flake details JSON. Fetch candidate details in parallel when the available tooling supports it.

Build one manifest row per ticket from its Flake details JSON: `issueId`, `repo`, `framework`, `testFile`, `testName`, `suite` (top-level describe / file basename family), `firstErrorLine`, `firstProjectStackFrame`, `pipelineUrl`, `commit`, `timestamps`, `priorTickets` (from the Prior Related Tickets section). Storm (`[storm:`) and burst (`[burst:`) tickets are pre-clustered by intake: treat each as a single-member cluster and release it; never merge them into other clusters.

Phase 1 is done when every non-skipped candidate has a manifest row — don't carry a partial manifest into Phase 2.

## Phase 2: In-flight context

Fetch what is already being worked, to catch duplicates before they spawn plans. Scope searches to the repos, files, normalized errors, helper names, and prior tickets from the Phase 1 manifest first; widen only when the scoped search leaves a plausible duplicate unresolved.

- Open Linear tickets labeled `flaky-implementation` (any state but terminal).
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

## Phase 4: Act (per cluster, in this order)

1. **Matches in-flight work** — error family or mechanism matches an open implementation ticket or open PR: close every member as Duplicate linked to that canonical, comment citing B5/D2 with the match evidence. Release nothing.
2. **Matches an open storm/burst ticket** — normalized error matches its signature or contained fingerprints: close members as Duplicate of the storm/burst ticket so late stragglers join the existing event.
3. **Infra blip / environment incident** — an incident cluster (evidence tier 7): use the Phase 3 threshold above. In production runs, corroborate via Phase 2 (Datadog monitor history / error spike through `pup` when available; passed-on-retry signals). Default action: close all members as Canceled with a D1 comment. If the incident exposes a hardening gap (e.g., seed path lacks diagnostics), release ONE canonical for that hardening and dup the rest to it — never one per helper.
4. **Multi-ticket cluster** — pick the canonical (richest evidence: most failures, clearest artifacts). Comment the cluster manifest on it: member IDs, shared mechanism, evidence tier from Phase 3, and the marker `<!-- flaky-triage: cluster=<short-slug> -->`. Close the other members as Duplicate of the canonical (D2 format). Release the canonical.
5. **Singleton or uncertain** — release as-is with a brief `<!-- flaky-triage: singleton -->` comment.

Before any action above releases a canonical ticket, search Linear for the fingerprint family with the `flaky-implementation` label across all states and without a date-window restriction, then count unique prior implementation ticket IDs. At **≥3 prior implementation tickets**, do not release the canonical for normal dispatch and leave it in `Triage` unassigned. Create the Linear `chronic` label first if it does not exist. Apply the `chronic` label and route the family to the credential-checked, dossier-first `flaky-deep-dive` skill. Add a ticket comment with the marker `<!-- flaky-triage: chronic -->` and dossier pointers listing every prior implementation ticket ID — but first search the ticket's existing comments for that exact marker and skip posting when it is already present; that absence check is what makes the comment idempotent across retries and re-runs. This ≥3-ticket count is a cheap screen staged before any diagnosis exists; the critic separately applies a sharper **≥2 failed merged fixes** test (see the flaky-critic rubric's Prior-attempts amendment) with the same chronic routing. The thresholds differ by design — by the evidence available at each stage — not by accident.

**Release** = set state to `Todo` and assign to the Linear API user (the viewer). Before release, ensure the ticket satisfies the Groundcrew eligibility contract from `../create-groundcrew-ticket/SKILL.md`: repository text in the description, exactly one `agent-*` label, leaf issue, and no non-terminal blockers unless intentionally blocked. Assignment + Todo is what makes groundcrew dispatch it; it also serves as the lease — released tickets never re-enter the queue.

## Phase 5: Digest

End with a compact report: queue size, cluster count with members and evidence tiers, released / duplicated / canceled / chronic-held counts, in-flight matches found, chronic detections with each canonical ticket and its prior implementation ticket IDs, and risks (possible false merges, missing evidence). When run as a recurring task, follow any re-arm instructions in the task description after the digest.

## Dry-run and backtest

When invoked with `--dry-run`, when the task description says dry run, or when backtesting: perform Phases 1–4 fully but **write nothing to Linear** — print each proposed action (`close STAFF-X as Duplicate of STAFF-Y, evidence: …`) instead. For a backtest, run blind against the historical tickets you are given (do not look up how they were actually resolved until after stating your clusters), then output only your proposed clusters and actions.
