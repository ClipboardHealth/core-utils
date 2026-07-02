# Plan a Flaky Test Fix -- E2E (Playwright)

Diagnosis and planning phase of the flaky-debug skill for Playwright E2E tests. Produces a structured plan that the user reviews. Ends at [`plan.md`](./plan.md) for the fix decision and plan output format.

## E2E Triage Snapshot

Capture these details first so the investigation is reproducible. If the user hasn't provided them, ask.

- Failing test file and name
- GitHub Actions run URL to fetch the LLM report
- Branch, commit, shard, timestamp, and issue/ticket link when available
- Whether the failure is one test, a retry-only flake, or a burst across many tests/shards

### Fetch the LLM Report

Downloads the `playwright-llm-report` artifact from a GitHub Actions run.

Resolve the bundled `scripts/` path relative to `SKILL.md`; do not use a target repository's `scripts/` directory.

```bash
bash "<flaky-debug-skill-dir>/scripts/fetch-llm-report.sh" "<github-actions-url>"
```

This downloads and extracts to `/tmp/playwright-llm-report-{runId}/`. The report is a single `llm-report.json` file.

### Cluster Before Per-Test Debugging

Before reading the failing test as if it is isolated, check whether the failure belongs to a broader pattern:

1. **Within the report:** group failures by first error line, stack frame, setup helper, console error, and failing lifecycle stage.
2. **Across attempts:** compare failed and passed retries for the same test; note the first divergence.
3. **Across CI context:** if issue tracker, GitHub Actions logs, CI logs, or test analytics are available, search the exact error and stack snippet across nearby runs, shards, commits, and runners.
4. **Across code history:** check whether the failing commit is still representative of current `main`; recent migrations can make an implementation plan stale even when the old failure was real.

If many tests fail in the same setup helper, dependency install step, auth/token path, or external service call, diagnose the shared mechanism first. Do not create per-test fixes for a shared failure.

## Classify the E2E Failure Surface

Use the earliest observed failure surface to decide where to investigate first:

| Surface                  | Primary signal                                                                | First places to look                                                                               |
| ------------------------ | ----------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------- |
| **CI/job setup**         | Failure before browser/user-flow code; install/build/config/tooling errors    | GitHub Actions logs, workflow YAML, dependency versions, cache keys, recent tooling releases       |
| **Test setup/auth/data** | Failure in fixtures, token minting, login, seed data, or one-time credentials | Setup helpers, external identity/data services, idempotency of retries, CI logs, service logs      |
| **App bootstrap**        | Blank page, static asset errors, hydration errors, route never becomes ready  | Browser console, static asset/network entries, deployment version, route bootstrap helpers         |
| **User action no-op**    | Click/input completes but expected request/dialog/route/state never starts    | Playwright trace, console/page errors, React error boundaries, remounts, permissions/session state |
| **Backend request**      | Expected request is emitted and fails, stalls, or returns unexpected data     | Request/response body, timings, trace/log correlation, backend code, data freshness                |
| **Post-success render**  | Request succeeds with expected data but UI does not reflect it                | Client cache invalidation, state updates, rendering conditions, console errors                     |
| **Assertion/locator**    | App state is correct but selector/assertion no longer matches intended UX     | Test selector, accessible names, UX drift, deterministic app-ready signal                          |

This classification can change as evidence improves. State the final surface in the plan.

## Classify the Flake Pattern (E2E)

For the full report schema, field reference, caps, and example reports:

1. If the repo has `node_modules/@clipboard-health/playwright-reporter-llm/`, read `README.md` and `docs/example-report.json` from there — exact version match to the report.
2. Otherwise, fetch the latest docs from GitHub:
   - `https://raw.githubusercontent.com/ClipboardHealth/core-utils/refs/heads/main/packages/playwright-reporter-llm/README.md`
   - `https://raw.githubusercontent.com/ClipboardHealth/core-utils/refs/heads/main/packages/playwright-reporter-llm/docs/example-report.json`

Cross-check the report's `schemaVersion` against the docs — if they disagree, the `main` docs describe a different version and some field semantics may not apply.

Read the docs if you need field semantics or limits; otherwise the field names used below are enough to drive the investigation.

Classify the flake to narrow the search space:

| Category                     | Signal                                                                            | Timeline Pattern                                                                              |
| ---------------------------- | --------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------- |
| **Shared setup/tooling**     | Many tests fail before user-flow assertions in the same helper or CI step         | `job/setup` or `beforeEach` fails across shards/runners with the same stack or command error  |
| **Auth/data setup**          | Token mint, login, seeded user/entity, or external test setup fails               | `beforeEach/setup` → service/CLI error before page actions                                    |
| **Test-state leakage**       | Retries or earlier tests leave auth, cookies, storage, or server state behind     | `attempts[]` — different outcomes across retries                                              |
| **Data collision**           | "Random" identities aren't unique enough and collide with existing users/entities | `errors[]` — duplicate key or conflict errors                                                 |
| **Backend stale data**       | API returned 200 but response body shows old state                                | `step(action)` → `network(GET, 200)` → `step(assert) FAIL` — API succeeded but data was stale |
| **Frontend cache stale**     | No network request after navigation/reload for the relevant endpoint              | `step(reload)` → `step(assert) FAIL` — no intervening network call for expected endpoint      |
| **Expected request missing** | User action succeeds but the expected network request never appears               | `step(click/input)` completes → no matching `network(...)` → assertion/wait fails             |
| **Silent network failure**   | CORS, DNS, or transport error prevented the request from completing               | `step(action)` → `console(error: "net::ERR_FAILED")` → `step(assert) FAIL`                    |
| **Render/hydration bug**     | API returned correct data but component didn't render it                          | `network(GET, 200, correct data)` → `step(assert) FAIL` — no console errors                   |
| **Environment / infra**      | Transient 5xx, timeouts, DNS/network instability                                  | `network` entries with 5xx status; `consoleMessages[]` with connection errors                 |
| **Locator / UX drift**       | Selector is valid but brittle against small UI changes                            | `errors[]` — locator/selector text in error message                                           |

## Analyze LLM Report

### Walk the Timeline

**Use `attempts[].timeline[]` as the primary analysis view.** The timeline is a unified, `offsetMs`-sorted array of all steps, network requests, and console entries. Walk it to reconstruct the exact event sequence around the failure:

```text
step(click "Submit") → network(POST /api/orders, 201) → step(waitForURL /confirmation) → console(error: "Cannot read property...") → step(expect toBeVisible) FAILED
```

For each timeline entry:

- **`kind: "step"`** — test action with `title`, `category`, `durationMs`, `depth`, optional `error`
- **`kind: "network"`** — slimmed HTTP entry with `method`, `url`, `status`, and `networkId`. Resolve `networkId` against `attempts[].network.instances[]` for per-request detail (`durationMs`, `timings`, `traceId`/`spanId`/`requestId`/`correlationId`, `requestBodyRef`/`responseBodyRef`, redirect links), and against `attempts[].network.groups[instance.groupId]` for shared shape (`resourceType`, `failureText`, `wasAborted`, occurrence counts)
- **`kind: "console"`** — browser message with `type` (warning/error/pageerror/page-closed/page-crashed) and `text`

All entries share `offsetMs` (milliseconds since attempt start), giving a single temporal view.

### Compare pass vs fail (flaky tests)

If you don't have passing and failing attempts for the same test, skip to [Identify failing tests](#identify-failing-tests).

Walk the failed attempt's timeline and the passed attempt's timeline side-by-side to identify the first divergence point:

1. Align both timelines by step title sequence
2. Find the first step/network/console entry that differs between attempts
3. The divergence answers "what was different this time?" directly

Common divergence patterns:

- **Same step, different network response** — backend returned different data (stale cache, race condition, eventual consistency)
- **Same step, network call missing in failed attempt** — frontend cache served stale data, or request was silently blocked
- **Same step, console error only in failed attempt** — CORS/network failure, or JS exception from unexpected state
- **Different step timing** — failed attempt took much longer before the assertion, suggesting resource contention or slow backend

### Identify failing tests

Filter `tests[]` for entries where `status` is `"failed"` or `flaky` is `true`. For each:

- **`errors[]`**: Contains clean error text with extracted assertion diffs and file/line location. This is usually enough to understand what went wrong.
- **`location`**: Source file, line, and column — jump straight to the code.
- **`attempts[]`**: Full retry history. Compare attempt outcomes, durations, and errors to see if the failure is consistent or intermittent.

### Examine attempts for retry patterns

For each attempt, compare `status`, `durationMs`, and `error` across retries — timing or error-shape differences between attempts often point at the trigger.

**Always decode `failureArtifacts.screenshotBase64` when present.** The page state at failure often reveals modals, loading spinners, error banners, or unexpected navigation that the assertion text alone doesn't explain.

If the LLM report does not show whether a click resolved, an element detached, a dialog appeared/disappeared, or a request was never emitted, download and inspect the full Playwright HTML report/trace artifact when available. The LLM report is an index, not the ceiling for evidence.

### Inspect network activity and extract trace IDs

Scan `attempts[].network.instances[]` for 4xx/5xx responses near the failure's `offsetMs` and use per-instance `timings` to isolate slow phases (DNS, connect, wait, receive). Join each instance to its group via `attempts[].network.groups[instance.groupId]` for shape-level signal (`failureText`, `wasAborted`, `resourceType`, `occurrenceCount`). Resolve payloads via `attempts[].network.bodies[instance.requestBodyRef | instance.responseBodyRef]` when the body matters.

**`traceId`** — when present on a failing instance (`attempts[].network.instances[].traceId`), you must follow [`./datadog-apm-traces.md`](./datadog-apm-traces.md) to correlate with backend behavior. This is the bridge between frontend test failure and potential backend root cause.

If no expected request was emitted, say that explicitly and do not diagnose backend latency for that action. Instead, use the trace, console/page errors, session/permission state, and frontend code path to explain why the request never started.

Check `attempts[].network.summary` for saturation. Non-zero `instancesDroppedByGroupCap`, `instancesDroppedByInstanceCap`, or `instancesEvictedAfterAdmission` means retained content is a sample and the request you care about may have been dropped — note this as a confidence-reducing factor. `instancesDroppedByFilter` alone is expected (static assets are filtered by design). v3 caps: instances 500, groups 200, bodies 100 per attempt.

### Use Available Observability Beyond APM

APM traces are valuable when an application request exists, but many E2E flakes fail before that. Use the observability surface that matches the failure surface:

- **CI/job setup:** GitHub Actions logs, cache keys, installed tool versions, runner/shard distribution.
- **Auth/data setup:** service logs, identity-provider/API audit logs, rate-limit/throttle metrics, setup helper output.
- **App bootstrap:** browser console, static asset responses, deployment/version metadata, CDN or webapp logs.
- **User action no-op:** Playwright trace actions, console/page errors, RUM/session events when available.
- **Backend request emitted:** APM traces, backend logs, request/response bodies, data store/cache traces.

Search exact error strings across a relevant time window and commit/shard context. Prefer primary telemetry over inference from test code when both are available.

### Review test steps

Prefer the timeline view above which interleaves steps with network and console. Fall back to `tests[].attempts[].steps[]` directly when you need the full nesting hierarchy via `depth`.

## Evidence Standard (E2E)

Do not propose a fix without concrete artifacts. At minimum, include:

- One **error artifact** — from `tests[].errors[]` (assertion diff, timeout message) or a trace/log entry
- One **network or lifecycle artifact**:
  - If a request was emitted: an instance from `attempts[].network.instances[]` (status, timing, trace ids) joined to its group via `attempts[].network.groups[instance.groupId]` (shape, `failureText`/`wasAborted`, occurrence counts), plus the body via `attempts[].network.bodies[instance.requestBodyRef | instance.responseBodyRef]` when relevant
  - If no request was emitted: the step/trace evidence showing the triggering action completed and the expected request/dialog/route transition never started
  - If failure happened before the app action: CI/setup/auth log evidence showing the failing command/service call
- A **specific code path** that consumed that state — use `tests[].location` to jump to the source
- When available: **screenshot** from `failureArtifacts.screenshotBase64` showing page state at failure
- When available: **Datadog trace** via `attempts[].network.instances[].traceId` showing backend behavior for the failing request
- When relevant: **logs/RUM/CI evidence** that confirms whether the issue is app, backend, infra, auth/test-data, or CI tooling
- A **confidence score** -- see [Confidence Score](./plan.md#confidence-score) in `plan.md` for the 1-5 scale and what to do with it.
