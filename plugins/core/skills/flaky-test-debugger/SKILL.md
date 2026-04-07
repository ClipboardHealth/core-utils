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

---

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

---

## Phase 2: Fast Path (non-E2E)

For service, component, and unit tests, the failure information plus the test source code is usually sufficient to diagnose and fix the flake. Do not over-investigate -- read the evidence, read the code, fix it.

### 2a: Gather Failure Context

Capture from the user's input (ask if missing):

- **Test file and name** -- exact file path and test title
- **Error message and stack trace** -- the raw failure output
- **Framework** -- Jest, Vitest, etc.
- **Whether it's a new flaky** -- first occurrence vs. recurring
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

### 2d: Diagnose and Fix

Apply the appropriate fix based on the pattern:

**Service test fixes:**

- Ensure `afterAll` closes the app _and_ awaits all open connections (DB, Redis, queues) before returning
- Pass `{ forceCloseConnections: true }` to `NestFactory.create()` (NestJS v10+) to auto-close keep-alive connections on shutdown, or explicitly close the Mongoose/TypeORM connection in `afterAll`
- Use dynamic/random ports (`listen(0)`) to avoid EADDRINUSE
- Isolate database state: use unique collection prefixes, transaction rollbacks, or per-test database cleanup
- If the test uses `setTimeout` or event-driven patterns, ensure the test awaits completion rather than relying on timing

**React component test fixes:**

- Wrap state-triggering actions in `act()` or use `waitFor`/`findBy*` queries that handle async updates
- When using fake timers, advance them explicitly (`jest.advanceTimersByTime`, `jest.runAllTimers`) and restore real timers in `afterEach`
- Ensure cleanup with `cleanup()` in `afterEach` (React Testing Library does this automatically unless disabled)
- Restore mocks in `afterEach` -- prefer `jest.restoreAllMocks()` in a shared setup

**Unit test fixes:**

- Eliminate shared mutable state: clone or reset objects in `beforeEach`, or make the module-level binding `const`
- Mock `Date.now` / `new Date()` explicitly when time matters; restore in `afterEach`
- If order-dependent, check for missing setup that another test was implicitly providing

### 2e: Evidence Standard (Fast Path)

Before proposing a fix, include at minimum:

- The **error message and stack trace** from the failure
- The **specific code path** in the test or production code that caused the flake
- A brief **explanation** of why the flake is intermittent (what timing or state condition triggers it)
- A **confidence score** (1-5, same scale as [E2E evidence standard](#confidence-score))

If confidence is 2 or below, recommend reproduction steps or instrumentation before committing to a fix.

Skip to [Phase 5: Fix Decision Tree](#phase-5-fix-decision-tree).

---

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

LLM report structure:

- **`summary`** -- quick pass/fail counts
- **`tests[].errors[].message`** -- ANSI-stripped, clean error text
- **`tests[].errors[].diff`** -- extracted expected/actual from assertion errors
- **`tests[].errors[].location`** -- exact file and line of failure
- **`tests[].flaky`** -- true if test passed after retry
- **`tests[].attempts[]`** -- full retry history with per-attempt status, timing, stdio, attachments, steps, and network
- **`tests[].attempts[].consoleMessages[]`** -- warning/error/pageerror/page-closed/page-crashed trace entries only (2KB text cap with `[truncated]` marker, max 50 per attempt, high-signal entries prioritized over low-signal)
- **`tests[].steps` / `tests[].network` / `tests[].timeline`** -- convenience aliases from the final attempt
- **`tests[].attempts[].timeline[]`** -- unified, sorted-by-`offsetMs` array of all retained events (`kind: "step" | "network" | "console"`). Slimmed-down entries for quick temporal scanning; full details remain in the source arrays
- **`offsetMs`** -- milliseconds since the attempt's `startTime`. Always present on steps (from `TestStep.startTime`). Optional on network entries (from trace `_monotonicTime` or `startedDateTime`, converted via the trace's `context-options` anchor) and console entries (from trace monotonic `time` field + anchor). Absent when the trace lacks a `context-options` event. Entries without `offsetMs` are excluded from the timeline
- **`tests[].attempts[].network[].traceId`** -- promoted from `x-datadog-trace-id` header for direct access
- **`tests[].attempts[].network[]`** -- max 200 per attempt, priority-based: fetch/xhr requests, error responses (status >= 400), failed, and aborted requests are retained over static assets (script, stylesheet, image, font). Includes failure details (`failureText`, `wasAborted`), redirect chain (`redirectToUrl`, `redirectFromUrl`, `redirectChain`), timing breakdown (`timings`), `durationMs` derived from available timing components, and allowlisted headers (`requestHeaders`, `responseHeaders`)
- **`tests[].attempts[].network[].responseHeaders`** -- includes `x-datadog-trace-id` and `x-datadog-span-id` when present (values capped to 256 chars)
- **`tests[].attempts[].failureArtifacts`** -- for failing/timed-out/interrupted attempts: `screenshotBase64` (base64-encoded screenshot, max 512KB), `videoPath` (first video attachment path). Omitted entirely when neither screenshot nor video is available
- **`tests[].attachments[].path`** -- relative to Playwright outputDir
- **`tests[].stdout` / `tests[].stderr`** -- capped at 4KB with `[truncated]` marker

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
- **`kind: "network"`** — HTTP request with `method`, `url`, `status`, optional `durationMs`, `resourceType`, `traceId`, `failureText`, `wasAborted`
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

Each attempt includes:

- `status` and `durationMs` — spot timing differences between passing and failing attempts
- `error` — failure reason per attempt (may differ across retries)
- `consoleMessages[]` — browser warnings/errors (only warning, error, pageerror, page-closed, page-crashed entries; capped at 2KB / 50 per attempt)
- `failureArtifacts` — for failed/timed-out/interrupted attempts:
  - `screenshotBase64` — base64-encoded failure screenshot (max 512KB). **Decode and inspect this** to see exactly what the page showed at failure time — often reveals modals, loading spinners, error banners, or unexpected navigation that the assertion text alone doesn't explain.
  - `videoPath` — path to video recording
- `network[]` — HTTP requests/responses for that attempt
- `timeline[]` — unified sorted event stream

### 4Ee: Inspect network activity and extract trace IDs

The `network[]` array (on tests or individual attempts) includes:

- `method`, `url`, `status` — identify 4xx/5xx responses
- `timings` — detailed breakdown: `dnsMs`, `connectMs`, `sslMs`, `sendMs`, `waitMs`, `receiveMs`
- `durationMs` — total request duration derived from timing components
- `requestHeaders`, `responseHeaders` — allowlisted headers
- `redirectChain` — full redirect sequence
- **`traceId`** — Datadog trace ID extracted from `x-datadog-trace-id` response header. **When present near a failure, you must use references/datadog-apm-traces.md for backend correlation to bridge the gap between frontend test failure and potential backend root cause.**

Network is capped at 200 entries per attempt, prioritized: fetch/xhr and error responses are retained over static assets. Headers/values capped at 256 chars. If all 200 entries are static assets (script/stylesheet/font) with no API calls, the capture is saturated.

### 4Ef: Review test steps

`tests[].steps[]` provides a step-by-step breakdown of test actions with timing (`offsetMs`, `durationMs`, `depth`). Prefer the timeline view (4Ea) which interleaves steps with network and console. Use steps directly when you need the full hierarchy (nested steps via `depth`).

## Phase 4E Evidence Standard

Do not propose a fix without concrete artifacts. At minimum, include:

- One **error artifact** — from `tests[].errors[]` (assertion diff, timeout message) or a trace/log entry
- One **network artifact** — from `tests[].network[]` or `attempts[].network[]` (response status, timing, headers)
- A **specific code path** that consumed that state — use `tests[].location` to jump to the source
- When available: **screenshot** from `failureArtifacts.screenshotBase64` showing page state at failure
- When available: **Datadog trace** via `network[].traceId` showing backend behavior for the failing request
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

---

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

Skip this step when the fix is **specific to one test's logic** -- for example, a wrong assertion value, a test-specific race condition in a unique setup, or a one-off typo.

### How to search

1. Identify the anti-pattern as a grep-able code pattern. Examples:
   - Missing connection cleanup: grep for `createTestingModule` in test files and check each for proper `afterAll` teardown
   - Hardcoded port: grep for `listen(3000)` or `listen(PORT)` in test files
   - Missing mock restore: grep for `jest.spyOn` in files that lack `restoreAllMocks`
   - Missing `act()`: grep for `render(` in `.test.tsx` files that call state-changing functions without `act` or `waitFor`

2. Scope the search to the same area of the codebase first (same package or directory), then widen if the pattern is pervasive.

3. Apply the same fix to each sibling. Keep changes minimal -- fix the anti-pattern, nothing else.

4. List the sibling files you fixed in the output so reviewers can verify them.

## Phase 7: Verification

Lint and type-check touched files.

## Output Format

When opening a PR for a flaky test fix, include `--label flaky-test-fix` in the `gh pr create` command so other agents can find it during Phase 1b deduplication.

When documenting the fix in a PR or issue, use this structure:

- **Confidence:** score (1-5) with brief justification
- **Symptom:** what failed and where
- **Root cause:** concise technical explanation
- **Evidence:** artifacts supporting the diagnosis (traces, network, error messages, screenshots as applicable)
- **Fix:** test-only, product-only, or both
- **Siblings fixed:** list of other files where the same anti-pattern was corrected (or "N/A -- fix was test-specific")
- **Validation:** commands and suites run
- **Residual risk:** what could still be flaky
