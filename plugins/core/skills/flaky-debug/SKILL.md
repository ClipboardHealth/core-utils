---
name: flaky-debug
description: Debug and fix flaky tests including Playwright E2E, NestJS service/integration, React component, and unit tests.
---

Phases run in order. Skip a phase if you already have the information it produces. Phase 3 runs only in fix mode.

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

## Phase 1b: Check for Existing Fixes

Before investigating, check whether someone (or another agent) has already fixed this flake.

1. **Search open PRs with the `flaky-test-fix` label** that touch the failing test file or its surrounding code. Use GitHub search scoped to the repo:
   - Search PRs labeled `flaky-test-fix` for the test file name or test directory
   - Review the PR's changes to assess whether they address the same flake pattern with reasonable confidence — if so, stop and report it to the user rather than opening a duplicate fix
   - If the PR only partially addresses the flake or targets a different root cause, note it and proceed with investigation
2. **Check recent commits on `main`** that touch the failing test file or its surrounding code:
   - `git log --oneline -20 origin/main -- <test-file-path>` and also check the parent directory or related source files
   - Read the commit messages — if one clearly fixes the same flake pattern, stop and report it to the user

If an existing fix is found, report:

- The PR number/URL or commit hash
- A brief summary of what it addresses
- Whether it fully covers the current flake or only partially

If no existing fix is found, proceed to Phase 2.

## Phase 2: Produce a plan

Follow [`references/plan-e2e.md`](./references/plan-e2e.md) for E2E tests, or [`references/plan-fast-path.md`](./references/plan-fast-path.md) for service, component, and unit tests. Both converge on [`references/plan.md`](./references/plan.md) for the fix decision and plan output format, and produce a structured plan with a confidence score.

If you are in plan mode, present the plan and stop here.

## Phase 3: Apply the plan (fix mode only)

Follow [`references/fix.md`](./references/fix.md). It takes the plan from Phase 2, applies the proposed fix, searches for sibling anti-patterns, and verifies. PR creation is out of scope -- if the user later opens one (or invokes a PR-shipping skill), label it `flaky-test-fix`.
