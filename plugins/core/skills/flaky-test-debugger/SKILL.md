---
name: flaky-test-debugger
description: Debug and fix flaky tests including Playwright E2E, NestJS service/integration, React component, and unit tests. Use this skill when investigating intermittent test failures, triaging flaky tests, or fixing test instability.
---

Work through these phases in order. Skip phases only when you already have the information they produce.

## Phase 1: Classify Test Type

Determine the test type from the user's input before doing anything else. The type dictates the investigation path.

| Type                             | Signals                                                                                                                                                              |
| -------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **E2E (Playwright)**             | `.spec.ts` file, mentions Playwright, has a GitHub Actions run URL with a `playwright-llm-report` artifact, browser-level errors                                     |
| **Service (NestJS integration)** | Spins up a NestJS app, uses `supertest` or similar HTTP testing, MongoDB/Redis connection errors, `*.service.spec.ts` or test descriptions mentioning "service test" |
| **React component**              | Uses `@testing-library/react`, `render()`, `screen.*`, `.test.tsx` file, React act() warnings                                                                        |
| **Unit**                         | Pure logic tests, `.test.ts` file, no app bootstrap or DOM, Jest/Vitest matchers on plain functions or classes                                                       |

If the type is ambiguous, check the test file extension and imports to confirm.

**Routing:** After completing Phase 1, always proceed to Phase 1b before investigating further.

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

If no existing fix is found, proceed to investigation:

- **E2E (Playwright):** Go to [Phase 2E: E2E Triage Snapshot](#phase-2e-e2e-triage-snapshot)
- **Service, React component, or Unit:** Go to [Phase 2: Fast Path](#phase-2-fast-path-non-e2e)

## Phase 2: Fast Path (non-E2E)

For service, component, and unit tests, the failure information plus the test source code is usually sufficient to diagnose and fix the flake. Do not over-investigate -- read the evidence, read the code, fix it.

### 2a: Gather Failure Context

Capture from the user's input (ask if missing):

- **Test file and name** -- exact file path and test title
- **Error message and stack trace** -- the raw failure output
- **Framework** -- Jest, Vitest, etc.
- **Failure metadata** -- branch, pipeline URL, duration, shard, timestamp (when available)

### 2b: Read the Test and Code Under Test

1. Read the failing test file. Focus on the specific failing test and its surrounding `describe`/`beforeEach`/`afterEach`/`afterAll` blocks.
2. Read the production code that the test exercises -- follow imports from the test file.
3. For service tests: also read the test module setup (the `Test.createTestingModule(...)` or app bootstrap code), and check for `afterAll` cleanup that closes the app/database connections.

### 2c: Classify the Flake Pattern

| Category                        | Test Types      | Signal                                                                                                             |
| ------------------------------- | --------------- | ------------------------------------------------------------------------------------------------------------------ |
| **Connection lifecycle**        | Service         | "connection closed", "topology destroyed", socket errors in stack -- app/DB not fully ready or torn down too early |
| **Port conflict**               | Service         | EADDRINUSE -- multiple test files bootstrapping on the same port                                                   |
| **Async teardown race**         | Service         | Errors appear after test passes -- `afterAll` closes the app while background work is still running                |
| **Database state leakage**      | Service         | Test depends on DB state that a parallel/prior test modified                                                       |
| **Unresolved async work**       | Component       | "not wrapped in act()" warnings, state updates after unmount                                                       |
| **Timer/animation not flushed** | Component       | Test asserts before `setTimeout`/`requestAnimationFrame` fires, or `useFakeTimers` not advanced                    |
| **Mock not restored**           | Component, Unit | `jest.spyOn` or `jest.mock` bleeds into the next test -- missing `mockRestore`/`restoreAllMocks`                   |
| **Shared mutable state**        | Unit            | Module-level variable or singleton mutated by one test, observed by another                                        |
| **Date/time sensitivity**       | Unit            | Test assumes a specific date, time zone, or `Date.now()` value that shifts across runs                             |
| **Test ordering dependency**    | All             | Passes in isolation, fails when run with other tests (or vice versa)                                               |

### 2d: Diagnose and Fix with Evidence

Before proposing a fix, include at minimum:

- The **error message and stack trace** from the failure
- The **specific code path** in the test or production code that caused the flake
- A brief **explanation** of why the flake is intermittent (what timing or state condition triggers it)
- A **confidence score** (1-5, same scale as [E2E evidence standard](#confidence-score))

If confidence is 2 or below, recommend reproduction steps or instrumentation before committing to a fix.

If >2, apply the appropriate fix.

Skip to [Phase 5: Fix Decision Tree](#phase-5-fix-decision-tree).

## Phase 2E: E2E Triage Snapshot

Capture these details first so the investigation is reproducible. If the user hasn't provided them, ask.

- Failing test file and name
- GitHub Actions run URL to fetch the LLM report

### Fetch the LLM Report

Downloads the `playwright-llm-report` artifact from a GitHub Actions run.

```bash
bash scripts/fetch-llm-report.sh "<github-actions-url>"
```

This downloads and extracts to `/tmp/playwright-llm-report-{runId}/`. The report is a single `llm-report.json` file.

## Phase 3E: Quick Classification

For the full report schema, field reference, caps, and example reports:

1. If the repo has `node_modules/@clipboard-health/playwright-reporter-llm/`, read `README.md` and `docs/example-report.json` from there — exact version match to the report.
2. Otherwise, fetch the latest docs from GitHub:
   - `https://raw.githubusercontent.com/ClipboardHealth/core-utils/refs/heads/main/packages/playwright-reporter-llm/README.md`
   - `https://raw.githubusercontent.com/ClipboardHealth/core-utils/refs/heads/main/packages/playwright-reporter-llm/docs/example-report.json`

Cross-check the report's `schemaVersion` against the docs — if they disagree, the `main` docs describe a different version and some field semantics may not apply.

Read the docs if you need field semantics or limits; otherwise the field names used below are enough to drive the investigation.

Classify the flake to narrow the search space:

| Category                   | Signal                                                                            | Timeline Pattern                                                                              |
| -------------------------- | --------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------- |
| **Test-state leakage**     | Retries or earlier tests leave auth, cookies, storage, or server state behind     | `attempts[]` — different outcomes across retries                                              |
| **Data collision**         | "Random" identities aren't unique enough and collide with existing users/entities | `errors[]` — duplicate key or conflict errors                                                 |
| **Backend stale data**     | API returned 200 but response body shows old state                                | `step(action)` → `network(GET, 200)` → `step(assert) FAIL` — API succeeded but data was stale |
| **Frontend cache stale**   | No network request after navigation/reload for the relevant endpoint              | `step(reload)` → `step(assert) FAIL` — no intervening network call for expected endpoint      |
| **Silent network failure** | CORS, DNS, or transport error prevented the request from completing               | `step(action)` → `console(error: "net::ERR_FAILED")` → `step(assert) FAIL`                    |
| **Render/hydration bug**   | API returned correct data but component didn't render it                          | `network(GET, 200, correct data)` → `step(assert) FAIL` — no console errors                   |
| **Environment / infra**    | Transient 5xx, timeouts, DNS/network instability                                  | `network` entries with 5xx status; `consoleMessages[]` with connection errors                 |
| **Locator / UX drift**     | Selector is valid but brittle against small UI changes                            | `errors[]` — locator/selector text in error message                                           |

## Phase 4E: Analyze LLM Report

### 4Ea: Walk the Timeline

**Use `attempts[].timeline[]` as the primary analysis view.** The timeline is a unified, `offsetMs`-sorted array of all steps, network requests, and console entries. Walk it to reconstruct the exact event sequence around the failure:

```text
step(click "Submit") → network(POST /api/orders, 201) → step(waitForURL /confirmation) → console(error: "Cannot read property...") → step(expect toBeVisible) FAILED
```

For each timeline entry:

- **`kind: "step"`** — test action with `title`, `category`, `durationMs`, `depth`, optional `error`
- **`kind: "network"`** — slimmed HTTP entry with `method`, `url`, `status`, and `networkId`. Resolve `networkId` against `attempts[].network.instances[]` for per-request detail (`durationMs`, `timings`, `traceId`/`spanId`/`requestId`/`correlationId`, `requestBodyRef`/`responseBodyRef`, redirect links), and against `attempts[].network.groups[instance.groupId]` for shared shape (`resourceType`, `failureText`, `wasAborted`, occurrence counts)
- **`kind: "console"`** — browser message with `type` (warning/error/pageerror/page-closed/page-crashed) and `text`

All entries share `offsetMs` (milliseconds since attempt start), giving a single temporal view.

### 4Eb: Compare pass vs fail (flaky tests)

If you don't have passing and failing attempts for the same test, skip to 4Ec.

Walk the failed attempt's timeline and the passed attempt's timeline side-by-side to identify the first divergence point:

1. Align both timelines by step title sequence
2. Find the first step/network/console entry that differs between attempts
3. The divergence answers "what was different this time?" directly

Common divergence patterns:

- **Same step, different network response** — backend returned different data (stale cache, race condition, eventual consistency)
- **Same step, network call missing in failed attempt** — frontend cache served stale data, or request was silently blocked
- **Same step, console error only in failed attempt** — CORS/network failure, or JS exception from unexpected state
- **Different step timing** — failed attempt took much longer before the assertion, suggesting resource contention or slow backend

### 4Ec: Identify failing tests

Filter `tests[]` for entries where `status` is `"failed"` or `flaky` is `true`. For each:

- **`errors[]`**: Contains clean error text with extracted assertion diffs and file/line location. This is usually enough to understand what went wrong.
- **`location`**: Source file, line, and column — jump straight to the code.
- **`attempts[]`**: Full retry history. Compare attempt outcomes, durations, and errors to see if the failure is consistent or intermittent.

### 4Ed: Examine attempts for retry patterns

For each attempt, compare `status`, `durationMs`, and `error` across retries — timing or error-shape differences between attempts often point at the trigger.

**Always decode `failureArtifacts.screenshotBase64` when present.** The page state at failure often reveals modals, loading spinners, error banners, or unexpected navigation that the assertion text alone doesn't explain.

### 4Ee: Inspect network activity and extract trace IDs

Scan `attempts[].network.instances[]` for 4xx/5xx responses near the failure's `offsetMs` and use per-instance `timings` to isolate slow phases (DNS, connect, wait, receive). Join each instance to its group via `attempts[].network.groups[instance.groupId]` for shape-level signal (`failureText`, `wasAborted`, `resourceType`, `occurrenceCount`). Resolve payloads via `attempts[].network.bodies[instance.requestBodyRef | instance.responseBodyRef]` when the body matters.

**`traceId`** — when present on a failing instance (`attempts[].network.instances[].traceId`), you must follow [`references/datadog-apm-traces.md`](./references/datadog-apm-traces.md) to correlate with backend behavior. This is the bridge between frontend test failure and potential backend root cause.

Check `attempts[].network.summary` for saturation. Non-zero `instancesDroppedByGroupCap`, `instancesDroppedByInstanceCap`, or `instancesEvictedAfterAdmission` means retained content is a sample and the request you care about may have been dropped — note this as a confidence-reducing factor. `instancesDroppedByFilter` alone is expected (static assets are filtered by design). v3 caps: instances 500, groups 200, bodies 100 per attempt.

### 4Ef: Review test steps

Prefer the timeline view (4Ea) which interleaves steps with network and console. Fall back to `tests[].attempts[].steps[]` directly when you need the full nesting hierarchy via `depth`.

## Phase 4E Evidence Standard

Do not propose a fix without concrete artifacts. At minimum, include:

- One **error artifact** — from `tests[].errors[]` (assertion diff, timeout message) or a trace/log entry
- One **network artifact** — an instance from `attempts[].network.instances[]` (status, timing, trace ids) joined to its group via `attempts[].network.groups[instance.groupId]` (shape, `failureText`/`wasAborted`, occurrence counts), plus the body via `attempts[].network.bodies[instance.requestBodyRef | instance.responseBodyRef]` when relevant
- A **specific code path** that consumed that state — use `tests[].location` to jump to the source
- When available: **screenshot** from `failureArtifacts.screenshotBase64` showing page state at failure
- When available: **Datadog trace** via `attempts[].network.instances[].traceId` showing backend behavior for the failing request
- A **confidence score** from 1 to 5 rating how certain you are in the root cause diagnosis

### Confidence Score

Rate your confidence in the root cause on a 1-5 scale. Report this score alongside your evidence.

| Score | Meaning             | Criteria                                                                                                                                                                                       |
| ----- | ------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **5** | Certain             | Root cause is directly visible in artifacts (e.g., assertion diff shows stale data, network response confirms 5xx, screenshot shows error banner)                                              |
| **4** | High confidence     | Evidence strongly supports the diagnosis but one link in the chain is inferred rather than observed (e.g., timeline shows the right sequence but no Datadog trace to confirm backend behavior) |
| **3** | Moderate confidence | Evidence is consistent with the diagnosis but alternative explanations remain plausible. Flag the alternatives explicitly                                                                      |
| **2** | Low confidence      | Limited evidence, mostly reasoning from code patterns rather than observed artifacts. Recommend gathering more data before committing to a fix                                                 |
| **1** | Speculative         | No direct evidence for the root cause. The fix is a best guess. Recommend reproducing the failure locally or adding instrumentation before proceeding                                          |

If confidence is 2 or below, do not propose a code fix. Instead, recommend specific instrumentation or reproduction steps to raise confidence.

## Phase 5: Fix Decision Tree

Applies to all test types.

Apply fixes in this order of priority:

1. **Validate scenario realism first.** Is the failure path possible for real users, or is it purely a test-setup artifact? If not user-realistic, prioritize test/data/harness fixes over product changes.

2. **Test harness fix** (when the failure is non-product):
   - Reset cookies, storage, and session between retries
   - Isolate test data; generate stronger unique identities
   - Make retry blocks idempotent
   - Wait on deterministic app signals, not arbitrary sleeps
   - (Service tests) Close connections and app properly in `afterAll`
   - (Component tests) Flush pending state updates and timers before asserting
   - (Unit tests) Reset shared mutable state in `beforeEach`

3. **Product fix** (when real users would hit the same issue):
   - Handle stale or intermediate states safely
   - Make routing/render logic robust to eventual consistency
   - Add telemetry for ambiguous transitions

4. **Both** if user impact exists _and_ tests are fragile.

## Phase 6: Fix Sibling Instances

After fixing the root cause, search for other tests that exhibit the same anti-pattern and fix them too. A flaky pattern in one test file almost always has siblings nearby.

### When to search

Search for siblings when the root cause is a **structural anti-pattern** -- something that would be wrong regardless of the specific test logic:

- Missing or incomplete teardown (`afterAll`/`afterEach` not closing connections, not restoring mocks)
- Hardcoded ports instead of dynamic allocation
- Shared mutable state without per-test reset
- Missing `act()` wrappers or `waitFor` around async assertions
- Fake timers not restored in `afterEach`
- Stale data patterns (E2E: missing reload/re-fetch; service: no DB cleanup between tests)

### When NOT to search

Skip this step when the fix is **specific to one test's logic** -- for example a test-specific race condition in a unique setup or a one-off typo.

### How to search

1. Identify the anti-pattern as a grep-able code pattern. Examples:
   - Missing connection cleanup: grep for `createTestingModule` in test files and check each for proper `afterAll` teardown
   - Hardcoded port: grep for `listen(3000)` or `listen(PORT)` in test files
   - Missing mock restore: grep for `jest.spyOn` in files that lack `restoreAllMocks`
   - Missing `act()`: grep for `render(` in `.test.tsx` files that call state-changing functions without `act` or `waitFor`

2. Scope the search to the same area of the codebase first (same package or directory), then widen if the pattern is pervasive.

3. Apply the same fix to each sibling. Keep changes minimal; fix the anti-pattern, nothing else.

4. List the sibling files you fixed in the output so reviewers can verify them.

## Phase 7: Verification

Lint and type-check touched files.

## Output Format

When opening a PR for a flaky test fix, include `--label flaky-test-fix` in the `gh pr create` command so other agents can find it during Phase 1b deduplication.

When documenting the fix in a PR or issue, use this structure:

- **Test ID:** if provided in prompt
- **Agent session ID:** your running session ID to resume if needed
- **Confidence:** score (1-5) with brief justification
- **Symptom:** what failed and where
- **Root cause:** concise technical explanation
- **Evidence:** artifacts supporting the diagnosis (traces, network, error messages, screenshots as applicable)
- **Fix:** test-only, product-only, or both
- **Siblings fixed:** list of other files where the same anti-pattern was or should be corrected (or "N/A -- fix was test-specific")
- **Validation:** commands and suites run
- **Residual risk:** what could still be flaky
