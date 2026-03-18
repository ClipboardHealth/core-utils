---
name: flaky-test-debugger
description: Debug and fix flaky Playwright E2E tests using Playwright reports and Datadog. Use this skill when investigating intermittent Playwright test failures, triaging a flaky E2E tests, or fixing test instability.
---

Work through these phases in order. Skip phases only when you already have the information they produce.

## Phase 1: Triage Snapshot

Capture these details first so the investigation is reproducible. If the user hasn't provided them, ask.

- Failing test file and name
- GitHub Actions run URL to fetch the LLM report

### Fetch the LLM Report

Downloads the `playwright-llm-report` artifact from a GitHub Actions run.

```bash
bash scripts/fetch-llm-report.sh "<github-actions-url>"
```

This downloads and extracts to `/tmp/playwright-llm-report-{runId}/`. The report is a single `llm-report.json` file.

## Phase 2: Quick Classification

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

## Phase 3: Analyze LLM Report

### 3a: Walk the Timeline

**Use `attempts[].timeline[]` as the primary analysis view.** The timeline is a unified, `offsetMs`-sorted array of all steps, network requests, and console entries. Walk it to reconstruct the exact event sequence around the failure:

```text
step(click "Submit") → network(POST /api/orders, 201) → step(waitForURL /confirmation) → console(error: "Cannot read property...") → step(expect toBeVisible) FAILED
```

For each timeline entry:

- **`kind: "step"`** — test action with `title`, `category`, `durationMs`, `depth`, optional `error`
- **`kind: "network"`** — HTTP request with `method`, `url`, `status`, optional `durationMs`, `resourceType`, `traceId`, `failureText`, `wasAborted`
- **`kind: "console"`** — browser message with `type` (warning/error/pageerror/page-closed/page-crashed) and `text`

All entries share `offsetMs` (milliseconds since attempt start), giving a single temporal view.

### 3b: Compare pass vs fail (flaky tests)

If you don't have passing and failing attempts for the same test, skip to 3c.

Walk the failed attempt's timeline and the passed attempt's timeline side-by-side to identify the first divergence point:

1. Align both timelines by step title sequence
2. Find the first step/network/console entry that differs between attempts
3. The divergence answers "what was different this time?" directly

Common divergence patterns:

- **Same step, different network response** — backend returned different data (stale cache, race condition, eventual consistency)
- **Same step, network call missing in failed attempt** — frontend cache served stale data, or request was silently blocked
- **Same step, console error only in failed attempt** — CORS/network failure, or JS exception from unexpected state
- **Different step timing** — failed attempt took much longer before the assertion, suggesting resource contention or slow backend

### 3c: Identify failing tests

Filter `tests[]` for entries where `status` is `"failed"` or `flaky` is `true`. For each:

- **`errors[]`**: Contains clean error text with extracted assertion diffs and file/line location. This is usually enough to understand what went wrong.
- **`location`**: Source file, line, and column — jump straight to the code.
- **`attempts[]`**: Full retry history. Compare attempt outcomes, durations, and errors to see if the failure is consistent or intermittent.

### 3d: Examine attempts for retry patterns

Each attempt includes:

- `status` and `durationMs` — spot timing differences between passing and failing attempts
- `error` — failure reason per attempt (may differ across retries)
- `consoleMessages[]` — browser warnings/errors (only warning, error, pageerror, page-closed, page-crashed entries; capped at 2KB / 50 per attempt)
- `failureArtifacts` — for failed/timed-out/interrupted attempts:
  - `screenshotBase64` — base64-encoded failure screenshot (max 512KB). **Decode and inspect this** to see exactly what the page showed at failure time — often reveals modals, loading spinners, error banners, or unexpected navigation that the assertion text alone doesn't explain.
  - `videoPath` — path to video recording
- `network[]` — HTTP requests/responses for that attempt
- `timeline[]` — unified sorted event stream

### 3e: Inspect network activity and extract trace IDs

The `network[]` array (on tests or individual attempts) includes:

- `method`, `url`, `status` — identify 4xx/5xx responses
- `timings` — detailed breakdown: `dnsMs`, `connectMs`, `sslMs`, `sendMs`, `waitMs`, `receiveMs`
- `durationMs` — total request duration derived from timing components
- `requestHeaders`, `responseHeaders` — allowlisted headers
- `redirectChain` — full redirect sequence
- **`traceId`** — Datadog trace ID extracted from `x-datadog-trace-id` response header. **When present near a failure, you must use references/datadog-apm-traces.md for backend correlation to bridge the gap between frontend test failure and potential backend root cause.**

Network is capped at 200 entries per attempt, prioritized: fetch/xhr and error responses are retained over static assets. Headers/values capped at 256 chars. If all 200 entries are static assets (script/stylesheet/font) with no API calls, the capture is saturated.

### 3f: Review test steps

`tests[].steps[]` provides a step-by-step breakdown of test actions with timing (`offsetMs`, `durationMs`, `depth`). Prefer the timeline view (3a) which interleaves steps with network and console. Use steps directly when you need the full hierarchy (nested steps via `depth`).

## Phase 4: Evidence Standard

Do not propose a fix without concrete artifacts. At minimum, include:

- One **error artifact** — from `tests[].errors[]` (assertion diff, timeout message) or a trace/log entry
- One **network artifact** — from `tests[].network[]` or `attempts[].network[]` (response status, timing, headers)
- A **specific code path** that consumed that state — use `tests[].location` to jump to the source
- When available: **screenshot** from `failureArtifacts.screenshotBase64` showing page state at failure
- When available: **Datadog trace** via `network[].traceId` showing backend behavior for the failing request

## Phase 5: Fix Decision Tree

Apply fixes in this order of priority:

1. **Validate scenario realism first.** Is the failure path possible for real users, or is it purely a test-setup artifact? If not user-realistic, prioritize test/data/harness fixes over product changes.

2. **Test harness fix** (when the failure is non-product):
   - Reset cookies, storage, and session between retries
   - Isolate test data; generate stronger unique identities
   - Make retry blocks idempotent
   - Wait on deterministic app signals, not arbitrary sleeps

3. **Product fix** (when real users would hit the same issue):
   - Handle stale or intermediate states safely
   - Make routing/render logic robust to eventual consistency
   - Add telemetry for ambiguous transitions

4. **Both** if user impact exists _and_ tests are fragile.

## Phase 7: Verification

Lint and type-check touched files

## Output Format

When documenting the fix in a PR or issue, use this structure:

- **Symptom:** what failed and where
- **Root cause:** concise technical explanation
- **Evidence:** trace and network artifacts (include screenshot and Datadog trace when available)
- **Fix:** test-only, product-only, or both
- **Validation:** commands and suites run
- **Residual risk:** what could still be flaky
