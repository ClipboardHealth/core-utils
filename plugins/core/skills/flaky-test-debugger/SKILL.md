---
name: flaky-test-debugger
description: Debug and fix flaky tests including Playwright E2E, NestJS service/integration, React component, and unit tests. Use this skill when investigating intermittent test failures, triaging flaky tests, or fixing test instability.
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

For E2E flakes, first classify where the failure surfaced in the lifecycle, then identify the test type. The failure surface dictates how broadly to investigate before reading or editing the test.

Common E2E failure surfaces:

- **CI/job setup:** dependency installation, CLI/tooling, environment setup, build/deploy, artifact download.
- **Test setup/auth/data:** token minting, login bootstrap, seeded users/entities, one-time credentials, external service setup.
- **App bootstrap/navigation:** static assets, route load, hydration, browser console/page errors before the user action.
- **User action:** click/input completed but the expected request, dialog, route change, or state transition did not start.
- **Backend request:** request emitted; backend returned error, stale data, unexpected shape, or excessive latency.
- **Assertion/locator:** app state is correct, but the assertion/selector is brittle or out of sync with the intended UX.

Then determine the test type from the user's input. The type dictates the detailed investigation path.

| Type                             | Signals                                                                                                                                                              |
| -------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **E2E (Playwright)**             | `.spec.ts` file, mentions Playwright, has a GitHub Actions run URL with a `playwright-llm-report` artifact, browser-level errors                                     |
| **Service (NestJS integration)** | Spins up a NestJS app, uses `supertest` or similar HTTP testing, MongoDB/Redis connection errors, `*.service.spec.ts` or test descriptions mentioning "service test" |
| **React component**              | Uses `@testing-library/react`, `render()`, `screen.*`, `.test.tsx` file, React act() warnings                                                                        |
| **Unit**                         | Pure logic tests, `.test.ts` file, no app bootstrap or DOM, Jest/Vitest matchers on plain functions or classes                                                       |

If the type is ambiguous, check the test file extension and imports to confirm.

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

Follow [`references/plan.md`](./references/plan.md). It walks investigation, diagnosis, evidence gathering, and the fix decision tree, and produces a structured plan with confidence score.

If the plan's confidence is less than 5/5, it must include the frontend and/or backend observability changes needed to reach 5/5 confidence next time. The plan may request changes across multiple repositories; assume we have access to all code.

If you are in plan mode, present the plan and stop here.

## Phase 3: Apply the plan (fix mode only)

Follow [`references/fix.md`](./references/fix.md). It takes the plan from Phase 2, applies the proposed fix, searches for sibling anti-patterns, and verifies. PR creation is out of scope -- if the user later opens one (or invokes a PR-shipping skill), label it `flaky-test-fix`.
