# Flaky-Fix Rubric

Mined from the [Groundcrew project](https://linear.app/clipboardhealth/project/groundcrew-4c31c63c5ed4), `flaky-test-fix` PRs across ClipboardHealth repos, and the `flaky-debug` / `flaky-test-bulk-debugger` skill docs.

## 1. Purpose & how the critic uses this doc

This rubric turns Rocky's observed review standards into checkable rules for flaky-test fix plans and PRs. When rejecting or flagging, the critic MUST cite the specific rule ID (e.g., "violates B1") and quote the offending diff hunk or plan sentence. A plan/PR that violates any B-rule is rejected; A-rules with their required evidence are auto-merge candidates; C-rules require the stated justification to be present verbatim in the plan or PR body.

Findings from automated reviewers (Mendral, CodeRabbit, etc.) are **advisory inputs, not binding rules**: the critic evaluates each on rubric merits and may decline one with stated reasoning, exactly as cb-babysit's Disagree replies do.

**Statement-missing vs substance-missing (backtest amendment, 2026-06-11):** B5/B6/B7/B8 each require an explicit statement in the plan (dedup-check results, Prior attempts section when applicable, confidence score plus observability section, current-main status, causal-chain section). When the _statement_ is absent but the violation is not demonstrated — no actual duplicate found, no actual prior implementation tickets for the fingerprint family, no actual low-confidence code fix, no actual staleness, no demonstrably symptom-terminated diagnosis — the verdict is reject with disposition **amend-and-resubmit**: one bounce asking for exactly the missing sections, never escalation. A demonstrated violation (a real duplicate, a mechanism already tried by a prior merged fix, a real ≤2/5 code fix, a diagnosis that demonstrably stops at a symptom) is a substantive reject. The 2026-06-11 backtest showed 6 of 7 false rejections were statement-missing on plans predating these conventions; live plans carry the sections by template, but the distinction stays load-bearing for the agreement metric.

## 2. Banned patterns

### B1 — Naked retry (retry without failure classification)

Adding retries that repeat on _any_ failure, or on a failure class that includes genuine errors.

**Why:** "Do not solve this by adding frontend waits or Playwright retries; that increases duplicate token setup and makes the Cognito throttle worse." (STAFF-1122). Org reviewer pushback on PR cbh-admin-frontend#6974: retrying all 422s means "a real validation error will now spin for 90s before timing out instead of failing fast" — the fix was narrowed so only opaque 500s retry while 422s stay gated on the specific readiness message. The skill's idempotency check (plan.md "Decide Fix Approach") must pass before any retry/wait change: safe to repeat, same scenario, doesn't amplify the root cause, no deterministic signal available instead.

**Detection heuristic:** diff adds `retry`, `retries:`, `toPass`, `async-retry`, a retry loop, or `page.reload()` inside a loop, AND the retry predicate does not discriminate transient failures (matches any error / any non-2xx / bare `catch`), OR the PR body lacks (a) why the retried operation is idempotent and (b) why no deterministic signal exists. Special case: retrying token minting, one-time credentials, seed-data creation, or rate-limited APIs without a concurrency cap is an automatic reject (retry amplification).

### B2 — Timeout/sleep inflation

Increasing a numeric timeout, adding `waitForTimeout`/`sleep`, or extending a fixed delay as the fix.

**Why:** plan.md: "Is there a deterministic signal to wait on instead of a longer timeout?" Accepted plan STAFF-1010 explicitly chose a readiness poll "over increasing the existing fixed CDC sleep." The one approved "increase timeout" PR (cbh-mobile-app#11242) was approved only after the diff morphed into removing the slow operation (`user.type()` of ~95 keystrokes → `fireEvent.change`) instead of raising the timeout. Human reviewer pushback on closed #11456: "I am seeing a lot of timeout overrides, waitForResponse should have handled this by itself."

**Detection heuristic:** diff increases any numeric timeout value, adds `waitForTimeout`, `setTimeout`-based sleeps, or `timeout:` overrides in test code, without a root-cause explanation in the PR body that states why the operation is legitimately slow and bounded. Multiple per-call timeout overrides in one spec is a strong reject signal.

### B3 — Assertion loosening

Weakening an assertion (exact → substring, visible → attached, removing an assertion, widening a match set, `force: true` clicks) to make the test pass.

**Why:** the corpus moves in the opposite direction: merged fixes made locators _exact_ (#5940), scoped assertions to the target (#6930), and asserted "durable UI state instead of transient toast visibility" (#6641). `force: true` was removed once the product bug was fixed (#6757, reviewer: "Since we made changes to the src code, I don't think we'd need the force: true anymore, right?"). fix.md: "Do not convert an infrastructure, backend, auth/data, or product-state root cause into a frontend timeout or locator retry."

**Detection heuristic:** diff removes/weakens an `expect`, replaces a specific matcher with a broader one, adds `force: true`, `exact: false`, `.first()`, or regex-broadens a locator, without evidence that the previous assertion was wrong about intended UX (e.g., genuinely duplicate toast as in #5941). Deleting an assertion is allowed only under A6 (whole-test removal with coverage proof) or with UX-drift evidence.

### B4 — Fixing the assertion site instead of the diagnosed surface

Editing the test where the failure surfaced when the evidence points to CI setup, auth/test-data, backend, or product code.

**Why:** SKILL.md: "avoid editing the test just because that is where the failure surfaced." fix.md: "The proposed fix targets the diagnosed failure surface, not only the final assertion." Self-correction example: "Backed out the interviews-list readiness retry. That was chasing the later symptom." (cbh-mobile-app#11338). The fix-locus decision order is: shared setup/CI → backend/data → product → test harness/data → assertion/locator _last_.

**Detection heuristic:** plan's stated failure surface (or the error evidence: 5xx bodies, throttle exceptions, setup-helper stack frames) is backend/setup/infra, but the diff touches only the spec file's waits/assertions. Reject and require the fix at the diagnosed surface or an explicit reason it is out of reach.

### B5 — Per-sighting fixes for a shared root cause (duplicate plans)

Opening one plan/PR per failing test when the failures share one mechanism (same run/burst, same helper, same error shape).

**Why:** Rocky closed five sibling "recover lazy chunk failure" PRs in seven minutes (cbh-admin-frontend #5645–#5649) and merged one canonical fix (#5650). Bulk-debugger skill: "Prefer one implementation ticket per root cause, not one per sighting" and "Do not create per-test fixes for a shared failure." Dedup comments: "No new implementation ticket needed; linking to STAFF-1010 and closing this investigation as a duplicate" (STAFF-1217); PR #6682 was closed as a no-op because the same pin already landed via #6680.

**Detection heuristic:** plan/PR does not state the results of the dedup check (open `flaky-test-fix` PRs touching the same file/helper, recent main commits, canonical Linear ticket for the fingerprint family). If the failing error line matches an existing canonical ticket's fingerprint family or an open sibling PR, reject as duplicate and route to the canonical.

**Prior-sibling signal (backtest amendment, 2026-06-11):** sibling PRs for the same mechanism that were closed _unmerged_ are a strong reject signal, not mere context. A plan citing closed-unmerged siblings must explain what is materially different this time — narrower scope alone is not an answer (the backtest's one genuine false approval cited prior wontfix siblings and explained them away).

**Prior attempts (amendment, 2026-07-16):** when a fingerprint family has prior implementation tickets, the plan MUST contain a **Prior attempts** section listing each prior ticket/PR, what it blamed, what it changed, and the recurrence evidence showing its diagnosis was wrong or incomplete. A missing section is statement-missing and gets amend-and-resubmit per §1. A plan that re-proposes a mechanism a prior merged fix already tried is a substantive reject. A family with **≥2 failed merged fixes** — merged fixes followed by recurrence — is disqualified from the normal fix path: verdict = reject and escalate as needs-human. Apply the `chronic` label and hold the ticket for the deep-dive track (a dedicated dossier-first investigation stage; until it exists, chronic tickets stay held with the label for human routing). The ≥2 threshold is intentionally different from flaky-triage's ≥3-prior-implementation-tickets screen: triage counts tickets cheaply before any diagnosis exists, while the critic can see merge and recurrence outcomes and applies the sharper failed-merged-fix test. Either stage flagging chronic routes the same way; the counts are staged by the evidence available at each stage, not a contradiction.

### B6 — Code fix on low-confidence diagnosis

Proposing a code change when root-cause confidence is ≤2/5, or any plan below 5/5 that omits observability follow-ups.

**Why:** plan.md: confidence ≤2 → "do not propose a code fix. Instead, recommend specific instrumentation or reproduction steps." Skill PR core-utils#686 (May 25) made it mandatory that "any fix plan below 5/5 confidence must include the frontend and/or backend observability changes that would make the next occurrence diagnosable at 5/5 confidence," spanning repositories if needed. Merged example of diagnostics-as-the-fix: #12109 "add Cognito SMS OTP diagnostics."

**Detection heuristic:** plan lacks a confidence score; or score ≤2 with a code diff attached; or score 3–4 without an "Observability to reach 5/5" section; or evidence section lacks the minimum artifacts (error artifact + network/lifecycle artifact + specific code path).

### B7 — Stale plan applied without re-verification

Implementing a plan against code that has changed on `main`, or for a flake already fixed.

**Why:** fix.md preflight requires "the failing commit's code path still exists on current `main`." STAFF-1122's canonical comment models this: "Main status: **not fixed on `main`** as of `<sha>`" with code citations. Closed PR #6682 (pin already landed on main) is the failure mode.

**Detection heuristic:** PR body lacks a "current main status" statement; or the diff conflicts with/duplicates a commit already on main touching the same lines.

**Staleness clause (backtest amendment, 2026-06-11):** a plan more than ~14 days old, or one whose fingerprint has new sightings since the plan was written, requires re-verification against current main before approval — treat unverified staleness as B7. (Two backtest "rejections" were plans that sat unworked until a sweep canceled them; freshness is part of a plan being gateable.)

### B8 — Unterminated causal chain (symptom-level diagnosis)

Proposing a code fix from a diagnosis that stops at the failure symptom — "the request 500ed/timed out," "setup was throttled," "the element never appeared" — without establishing _why_ at a specific cause in the owning code, config, or infrastructure.

**Why (amendment, 2026-07-07):** post-Done recurrence is the pipeline's dominant failure mode: in the Jun 2–Jul 6 window, 21 fingerprint families re-flaked after a Done closure, and the fullLifecycle family (33deef731a10) was closed Done six times. Each recurrence traces to a diagnosis that dead-ended at the repo boundary or at a status code and patched the symptom locally. Local-symptom plans are the cheapest to produce, so as long as the gate accepts them, agents keep producing them; this rule makes boundary-crossing the only way to pass.

**Required structure:** the plan must contain a **Causal chain** section: failing assertion → app/UI state → network/trace/log evidence (trace ID, or run-window log queries when the causal event is outside the test's request path: seeding, deploys, CDC/async jobs) → owning service and repo, resolved via the groundtruth ownership registry (`ClipboardHealth/groundtruth`, `registry/services.json` → `registry/repos.json`) → terminal cause cited at file/line, config key, or specific log line. The link types adapt to the failure surface: CI/setup, fixture, component, and unit failures substitute build logs, fixture state, or runner artifacts for network evidence and the owning package/repo for a deployed service — the critic checks the terminus, not a fixed link shape. Two valid terminal states:

1. **Terminated:** the chain ends at a cause. A status code, timeout, or throttle is a link, never a terminus.
2. **Explicitly broken:** the chain names the link where evidence ran out and the observability that would extend it; confidence is capped at 2/5 and B6 applies — the deliverable is the instrumentation, not a code fix.

**Confidence ceiling:** 5/5 additionally requires reproduction by inducing the blamed cause — fault injection in the harness (delay or fail the specific response, disable the seed step) or a focused lower-level test that deterministically reproduces the race. Without reproduction, the ceiling is 4/5. One inferred _intermediate_ link with an evidenced terminus is still a terminated chain (≤4/5); an unevidenced terminus is a broken chain (cap 2/5).

**Detection heuristic:** plan lacks a Causal chain section (statement-missing → amend-and-resubmit per §1); the terminal link is a symptom rather than a cause; the chain implicates another service or repo but cites no code/log evidence from it and doesn't route per C5/D5; or the plan claims 5/5 without reproduction evidence.

## 3. Allowed/safe patterns

These have strong precedent (counts from the 74 merged `flaky-test-fix` PRs; classification approximate) and are auto-merge candidates **only** when the listed evidence is present in the PR body.

### A1 — Deterministic readiness gate (poll a real signal, fail loud)

Wait for the same API/state the UI consumes (or a page-ready signal) before acting; bounded attempts; on exhaustion, throw with the last status/body/IDs.

- **When:** fresh entities not yet visible through a read model/CDC lag; route or dialog needs data before interaction. (~16 merged PRs: #6211, #6912, #12005, #6792, #11365, …)
- **Required evidence:** the polled signal is the one the failing UI path actually uses (STAFF-1010 polled "the same offer-estimate path used by the dialog"); a bounded timeout; the exhaustion error includes last status/body/request metadata; explicitly NOT a fixed sleep.
- **Shared-helper rule:** when the repo already has a readiness gate for the same mechanism (e.g., CDC/read-model lag), a new per-spec gate is **rejected** — the fix must use, extend, or extract a shared per-repo helper instead (STAFF-1010 already proposed "extracting a shared fresh-shift offer/readiness helper"). The ~16-gate sprawl in six weeks is the failure mode this prevents. Auto-merge therefore additionally requires: no prior gate for this mechanism exists in the repo, OR the diff goes through the shared helper.

### A2 — Test-data isolation & uniqueness

Stronger unique identities, removal of hardcoded values that interact badly with system constants, per-test state reset, documented service-test app lifecycle (`createTestApp()` + `reset()`).

- **When:** collisions (phone/email/IDs), cross-test state leakage, boundary interaction of seeded values. (~8 merged: #6931, #25161, #24184, #25859, #11662, open-shifts#5188.)
- **Required evidence:** the collision/leak mechanism named with the artifact that proves it (open-shifts#5188 cited the audit log showing `windowWorkers: []` and quantified the flake probability); fix matches sibling tests' existing pattern where one exists.

### A3 — Clock/time determinism

Fake timers or frozen clocks for tests asserting time-boundary logic; remove weekday/timezone dependence.

- **When:** failures cluster at day/period boundaries or depend on run time. (~3 merged: #25464, #25362, #25003.)
- **Required evidence:** the time-dependence is identified (which boundary), timers restored in `afterEach`.

### A4 — Assertion/locator hardening (tightening, never loosening)

Exact/scoped locators, assert durable state instead of transient toasts, assert the action's observable outcome.

- **When:** app state is correct and the selector/assertion is the only broken part — the _last_ resort in the fix decision order. (~8 merged: #5940, #6930, #6641, #11409, …)
- **Required evidence:** artifact showing app state was correct (screenshot/network); the new assertion is strictly more specific or more durable than the old one.

### A5 — Product fix for a real race surfaced by the test

Fix the remount/race/cache/error-handling bug users can also hit; then remove any test workaround.

- **When:** real users can hit the same state. Highest-value class (~14 merged: #6962 remount, #6961 401-redirect loop, #5650 chunk-load recovery, #6173 cache keys, #6757 menu close).
- **Required evidence:** the user-facing failure mode described (STAFF-1417: "removes the logout loop for real users"); accompanying test workarounds (e.g., `force: true`) removed in the same PR.

### A6 — Test removal when coverage is duplicated

Delete an E2E that re-tests logic covered deterministically at a lower level.

- **When:** failure artifacts show correct app/backend state and a focused lower-level test covers the behavior. (3 merged: #11753, #11612, #11613.)
- **Required evidence:** PR body names the surviving covering test and shows the artifacts proving the E2E's failure was harness-timing, not product. Auto-merge eligible like other A-rules when that evidence is present; a deletion whose test is the only coverage of the user flow does not qualify as A6 at all.

### A7 — Setup/auth hot-path de-stressing

Remove stateful writes from per-test setup, serialize/cache shared-credential acquisition, pre-provision invariants.

- **When:** throttling errors (`TooManyRequestsException`, rate limits) in setup across shards. (~7 merged: #6697, #11751, #6738, #5733.)
- **Required evidence:** backend telemetry showing the throttle source (STAFF-1122 cited CloudTrail: 980 `AdminUpdateUserAttributes` throttles); the fix reduces call volume or concurrency rather than just retrying it; validation re-runs the affected specs "with Playwright retries disabled once to prove the root cause is gone rather than hidden."

## 4. Conditional patterns

### C1 — Bounded, classified retry

Allowed only when ALL of: the retried operation is idempotent and preserves the test scenario; the retry predicate matches _only_ transient failure signatures (named errors/status codes — opaque 500s yes, validation 422s no, per #6974's resolution); attempts are bounded; exhaustion reports attempts + last stdout/stderr/status/body; the retry cannot amplify the root cause (rate limits, one-time credentials, duplicate writes). Precedent: #6442 ("retries only transient CLI/network/rate-limit failures … reports attempts/stdout/stderr"), #25431, #11662. A retry as a _bridge_ during a migration must be labeled "a migration guard, not the final design" (STAFF-1122) with the follow-up named.

For uniqueness-collision retries, the retry form must match the error semantics, and the plan must state which case applies: regenerate a _fresh_ identity when the failure is a constraint violation on the identity itself (#11662 regenerated OTP phone numbers); re-attempt the _same_ identity only when the failure is transient (timeout, 5xx) rather than a collision.

### C2 — Polling/web-first assertions (`expect().toPass`, poll-until)

Allowed only when the asserted behavior is genuinely asynchronous/event-driven (eventual consistency, background job) and the poll wraps a _specific_ assertion with a bounded timeout — not a page-reload-until-green loop around a whole flow. The plan must state why no single deterministic completion signal exists.

### C3 — Network mocking / mock fidelity changes

Allowed when the mock is corrected to match the real contract (e.g., #11692 PDF CORS headers, #11936 required `modificationReason`) or when third-party nondeterminism must be removed (#5989 Google Maps autocomplete). Not allowed to mock away the system under test in an E2E whose purpose is to exercise that path.

### C4 — CI/tooling pin or environment guard

Allowed when many tests fail before user-flow code and the evidence is a tool/version/deploy drift (STAFF-1320: deployed UI didn't match `E2E_CHECKOUT_REF`; fix = fail fast or assert deployed commit). Requires: run-level evidence (not single-test), and a dedup check — two such PRs were closed because the pin already landed (#6682) or the approach was superseded (#6824).

### C5 — Cross-repo/backend recommendation

When the root cause is in another team's service, the plan may ship the local resilience fix and must route a recommendation to the owning team (STAFF-1413: frontend rethrow fix + "backend follow-up recommendation (… 503 instead of 401) is noted in the ticket for the owning team"). It may not silently absorb a backend bug into test code.

## 5. Dispositions that need no code

### D1 — Infra blip / environment incident (close as Canceled)

Required evidence (model: STAFF-1419/STAFF-1420 CDC-lag burst):

- A bounded incident window with telemetry: error-count spike (before/during/after), monitor Triggered/Recovered timestamps, deploy/Watchdog version-change correlation.
- Cross-checks: same-minute failures across repos/shards; affected tests "all passed on retry."
- A statement that existing harness behaved correctly ("The readiness helpers did their job: they polled … classified the failure, and emitted shift IDs + status + body").
- Why code can't help: "An ~8-minute backend replication outage isn't fixable in test code."
- Re-arm note: "The next intake run will create per-test tickets for any contained fingerprint that flakes again outside this burst."

### D2 — Duplicate (close as Duplicate, link canonical)

Required evidence: fingerprint/test/file plus error shape matches an existing investigation family ("the same file/test and HTTP 422 shape were investigated in STAFF-1001"); link both the canonical investigation and its implementation ticket/PR; explicitly state "No new implementation ticket needed." ~25% of the Linear corpus (156/636) closed this way — the critic should _expect_ duplicates and check before approving any new plan.

### D3 — Already fixed / stale

Required evidence: the merged PR/commit on main that covers the flake (e.g., "covered by merged PR #6697"), and confirmation the failing sighting predates the fix. Recurrences after the fix go to the canonical ticket ("Still failing in CI; flake-intake deduplicated this sighting to the canonical fix ticket"), not a new one.

### D4 — Burst with no shared cause identified

Per the flake-intake burst template: "If no shared cause is identifiable, comment with the reason and close this ticket as Won't Do" — per-test tickets regenerate automatically on recurrence outside the burst.

### D5 — Upstream/owning-team bug

Close-out comment must name the owning service/team, the trace/log evidence, and the recommendation handed off (see C5). No test-side band-aid in lieu of the handoff.

## 6. Resolved decisions (Rocky, 2026-06-10)

All seven open questions from the mining pass were answered; the substantive ones are folded into the rules above. Kept here as provenance for the living doc:

1. **Corpus span:** the ~6-week labeled corpus (2026-04-30 onward) is sufficient; no mining of older SYN-/ACT-/ALCH-prefixed history before the critic enforces auto-merge.
2. **B3 (assertion loosening):** confirmed as written, including hard-reject on `exact: false`/`.first()`; adjust from experience if it over-fires.
3. **A6 (test removal):** auto-merge eligible when its required evidence is present — no standing human-review carve-out.
4. **A1 (readiness-gate sprawl):** critic rejects new per-spec gates when a shared helper for the mechanism exists or should be extracted (now A1's shared-helper rule).
5. **Automated reviewer findings (Mendral/CodeRabbit):** advisory, never binding (now in §1).
6. **Closed PRs #6824/#6572:** confirmed supersession, not approach rejections; C4's reading stands.
7. **C1 collision retries:** form depends on identity type and error semantics — regenerate on constraint violations, re-attempt only on transient failures (now in C1).

## 7. Appendix: corpus stats

**Read:** 753 Linear issues enumerated (636 flaky-labeled; statuses: Done 431, Duplicate 156, Canceled 37, open 12); comments read on ~35 sampled issues (weighted to Canceled/canonical/impl tickets — most per-test tickets have only bot sighting comments). 88 `flaky-test-fix` PRs enumerated (74 merged, 13 closed, 1 open); bodies/diffs/review threads read on ~25; Rocky-authored review/issue comments harvested across all 88 (79 inline + 37 conversation comments, mostly cb-babysit); 4 skill-update PRs in core-utils; flake-intake pipeline templates in ClipboardHealth/clipboard.

**Pattern frequency (merged PRs, approximate title+body classification):**

| Pattern                                             | Count |
| --------------------------------------------------- | ----- |
| Readiness gate / deterministic wait                 | ~16   |
| Product fix surfaced by flake                       | ~14   |
| Assertion/locator tightening                        | ~8    |
| Auth/setup throttle removal, serialization, caching | ~7    |
| Bounded classified retry                            | ~6    |
| Test-data isolation/uniqueness                      | ~6    |
| Mock fidelity                                       | ~4    |
| Clock/time determinism                              | ~3    |
| Test removal (duplicated coverage)                  | 3     |
| Diagnostics-only                                    | ~2    |
| Service-test lifecycle isolation                    | ~2    |

**Ten most instructive examples:**

1. STAFF-1122 + cbh-admin-frontend#6697 — canonical throttling cluster; "Do not solve this by adding frontend waits or Playwright retries."
2. STAFF-1419/STAFF-1420 — gold-standard infra-blip no-code disposition.
3. cbh-admin-frontend#5645–#5650 — duplicate-PR consolidation; one root cause, one merge.
4. STAFF-1010 — accepted plan format; readiness poll over CDC sleep.
5. cbh-admin-frontend#6974 — retry-classification pushback (500 vs 422).
6. cbh-admin-frontend#6442 (STAFF-942) — anatomy of an acceptable retry.
7. cbh-mobile-app#11242 — timeout-inflation PR converted to root-cause fix before approval.
8. cbh-mobile-app#11753 (STAFF-922) — test removal with coverage proof.
9. open-shifts#5188 (SYN-1919) — test-data fix with quantified evidence (Monte Carlo, audit log).
10. STAFF-1413 + cbh-admin-frontend#6961 — incident-window diagnosis producing a product fix plus owning-team handoff.
