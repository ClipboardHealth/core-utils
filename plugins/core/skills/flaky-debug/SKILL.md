---
name: flaky-debug
description: Debug and fix flaky tests including Playwright E2E, NestJS service/integration, React component, and unit tests.
---

Phases run in order. Phase 0 is mandatory. Skip a later phase if you already have the information it produces. Phase 3 runs only in fix mode.

## Phase 0: Verify investigation access

Run these checks before classifying or diagnosing the failure. Do not silently continue with reduced evidence if a check fails.

1. Verify that `pup` can read APM spans. Do not use `pup auth status`; it can fail in sandboxes where environment-variable authentication works.

   ```bash
   command -v pup
   pup traces search \
     --query="service:cbh-backend-main env:staging" \
     --from=15m \
     --limit=1 \
     --jq='.data | length'
   ```

   A successful query is sufficient even when the count is zero. If `pup` is missing, install it and rerun the check. For `401`/authentication failures, run `pup auth login` on a developer machine or provide `DD_API_KEY` and `DD_APP_KEY` in a sandbox/CI session. For `403`, obtain an application key or OAuth session with APM read access.

2. For a CI-sourced E2E failure, verify artifact access by fetching the exact run before doing any diagnosis:

   ```bash
   bash "<flaky-debug-skill-dir>/scripts/fetch-llm-report.sh" "<github-actions-url>"
   ```

   If GitHub authentication fails, run `gh auth login --hostname github.com` and ensure the token can read Actions artifacts in the repository. If the artifact is missing or expired, rerun the source workflow or obtain the `playwright-llm-report`/Playwright HTML report from the user. A missing run URL or inaccessible artifact blocks a CI-sourced E2E investigation; report the failed command and remediation instead of degrading the confidence score. Artifact access is not applicable to service, component, or unit failures that were reproduced locally with complete output.

## Mode: plan vs fix

This skill runs in one of two modes:

- **Fix mode (default for local/unit-sized fixes):** produce a plan, then apply it.
- **Plan mode:** produce a plan and stop, for human review.

Use plan mode when the user asks for a plan, an investigation, a triage report, or says "don't fix yet" / "just plan it".

For CI-sourced E2E flakes, prefer plan mode unless the user explicitly asks you to implement a fix or the root cause is already clear, high-confidence, and local to the repository. E2E flakes often originate in CI setup, auth/test-data infrastructure, backend behavior, deployment assets, or product code; avoid editing the test just because that is where the failure surfaced.

Both modes share the same diagnosis path; the plan is the artifact you hand to a reviewer (plan mode) or to yourself (fix mode) before editing code.

## Phase 1: Classify Failure Surface and Test Type

Determine the test type from the user's input. The type dictates the detailed investigation path.

| Type                             | Signals                                                                                                                                                              |
| -------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **E2E (Playwright)**             | `.spec.ts` file, mentions Playwright, has a GitHub Actions run URL with a `playwright-llm-report` artifact, browser-level errors                                     |
| **Service (NestJS integration)** | Spins up a NestJS app, uses `supertest` or similar HTTP testing, MongoDB/Redis connection errors, `*.service.spec.ts` or test descriptions mentioning "service test" |
| **React component**              | Uses `@testing-library/react`, `render()`, `screen.*`, `.test.tsx` file, React act() warnings                                                                        |
| **Unit**                         | Pure logic tests, `.test.ts` file, no app bootstrap or DOM, Jest/Vitest matchers on plain functions or classes                                                       |

If the type is ambiguous, check the test file extension and imports to confirm.

If the type is E2E, also classify where the failure surfaced in the lifecycle -- see [Classify the E2E Failure Surface](./references/plan-e2e.md#classify-the-e2e-failure-surface) in `plan-e2e.md`. The failure surface dictates how broadly to investigate before reading or editing the test.

## Phase 1b: Build the Dossier, Consult the Knowledge Base, and Check for Existing Fixes

Before diagnosing, build the fingerprint family's dossier, then check whether someone (or another agent) has already fixed this flake. Do not limit the dossier to the failing file or recent activity.

1. **Search Linear for the fingerprint family and exact test title.** Derive the fingerprint family from the ticket title or Flake details and the full test title from `testName`. Run these four `list_issues` queries, then union and deduplicate the results by ticket ID:

   ```text
   project: "Groundcrew", label: "flaky-investigation", query: "<fingerprint-family>"
   project: "Groundcrew", label: "flaky-investigation", query: "<exact full test title>"
   project: "Groundcrew", label: "flaky-implementation", query: "<fingerprint-family>"
   project: "Groundcrew", label: "flaky-implementation", query: "<exact full test title>"
   ```

   For all four queries, omit the state filter so every state, including terminal states, is searched. Omit created/updated date filters; there is no 14-day restriction. The `query` field must search issue titles and descriptions, not the file name alone.
   - Fetch every matching issue with `get_issue`, then read its relations, comments, and linked PRs so closed and merged attempts are not lost to truncated list results

2. **Consult the root-cause knowledge base alongside the Linear search.** Open [`references/root-cause-kb/README.md`](./references/root-cause-kb/README.md), compare the observed fingerprint, error text, failure surface, and causal evidence with its symptom index, and read every plausible entry in full.
   - A matching symptom signature seeds the diagnosis with the entry's known mechanism; it does not prove the mechanism. Confirm or falsify it against the current artifacts and causal chain.
   - Read the entry's **What failed and why** section before proposing a fix. Carry those failed-fix patterns into the dossier even when the current Linear family has no prior implementation ticket.
   - Record one of these statements before diagnosis:
     - `KB match: <entry link> — <matched symptom signature>; mechanism hypothesis: <mechanism>; failed fixes to avoid: <summary>.`
     - `KB match: none — checked <symptom signatures/fingerprint> against the index.`
   - If more than one entry is plausible, cite each candidate and state the evidence that selects or falsifies it. Create a new entry only when the causal terminus establishes a genuinely novel mechanism.

   See the checked-in [KB lookup and close-out dry run](./references/root-cause-kb/dry-run-workplace-review-sheet.md) for one full cycle.

3. **Build the `Prior attempts` table before diagnosis.** Add one row for each prior implementation ticket and linked PR found through either query. The table columns are `Prior ticket/PR`, `What it blamed`, `What it changed`, and `Recurrence evidence`. The table must list each prior ticket/PR, what it blamed, what it changed, and the recurrence evidence showing its diagnosis was wrong or incomplete. Use later investigation sightings and post-merge failures as recurrence evidence; do not infer failure merely because an attempt is old. If there are no prior implementation tickets, record `None found` plus the fingerprint and test-title searches run. Keep KB-derived failed-fix history in the separate `KB match` statement unless the entry links a ticket or PR to this fingerprint family; do not manufacture family-specific prior attempts from a mechanism-level entry.
4. **Search open PRs with the `flaky-test-fix` label** that touch the failing test file or its surrounding code. Use GitHub search scoped to the repo:
   - Search PRs labeled `flaky-test-fix` for the test file name or test directory
   - Review the PR's changes to assess whether they address the same flake pattern with reasonable confidence — if so, stop and report it to the user rather than opening a duplicate fix
   - If the PR only partially addresses the flake or targets a different root cause, note it and proceed with investigation
5. **Check recent commits on `main`** that touch the failing test file or its surrounding code:
   - `git log --oneline -20 origin/main -- <test-file-path>` and also check the parent directory or related source files
   - Read the commit messages — if one clearly fixes the same flake pattern, stop and report it to the user

If an existing fix is found, report:

- The PR number/URL or commit hash
- A brief summary of what it addresses
- Whether it fully covers the current flake or only partially
- The `Prior attempts` table, including recurrence evidence for any failed prior diagnosis
- The `KB match` statement, including the cited entry and failed-fix history when matched

If no existing fix is found, proceed to Phase 2.

## Phase 2: Produce a plan

Follow [`references/plan-e2e.md`](./references/plan-e2e.md) for E2E tests, or [`references/plan-fast-path.md`](./references/plan-fast-path.md) for service, component, and unit tests. Both converge on [`references/plan.md`](./references/plan.md) for the fix decision and plan output format, and produce a structured plan with a confidence score.

If you are in plan mode, present the plan and stop here.

## Phase 3: Apply the plan (fix mode only)

Follow [`references/fix.md`](./references/fix.md). It takes the plan from Phase 2, validates the recorded sibling frontend check and reruns it when stale or missing, applies the proposed fix, searches for same-repo sibling anti-patterns, and verifies. PR creation is out of scope -- if the user later opens one (or invokes a PR-shipping skill), label it `flaky-test-fix`.

After that fix merges, the knowledge-base close-out in `fix.md` is required. Update the matched entry with the new evidence, repository/surface, fix result, and any newly established failed-fix history, or add a new mechanism-indexed entry when the causal terminus was genuinely novel.
