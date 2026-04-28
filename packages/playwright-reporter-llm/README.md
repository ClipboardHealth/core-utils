# @clipboard-health/playwright-reporter-llm <!-- omit from toc -->

Playwright reporter that outputs structured JSON for LLM agents. Minimal console output, flat schema, easy to filter to failures.

## Table of contents <!-- omit from toc -->

- [Install](#install)
- [Usage](#usage)
  - [Options](#options)
  - [Console output](#console-output)
  - [What to read, by task](#what-to-read-by-task)
  - [Minimal failure example](#minimal-failure-example)
  - [Flaky test example (pass-vs-fail comparison)](#flaky-test-example-pass-vs-fail-comparison)
  - [Full example report](#full-example-report)
  - [Field reference](#field-reference)
- [Why not Playwright's built-in JSON reporter?](#why-not-playwrights-built-in-json-reporter)
- [Local development commands](#local-development-commands)

## Install

```bash
npm install @clipboard-health/playwright-reporter-llm
```

```typescript
// playwright.config.ts
import { defineConfig } from "@playwright/test";

export default defineConfig({
  reporter: [
    ["@clipboard-health/playwright-reporter-llm", { outputFile: "test-results/llm-report.json" }],
  ],
});
```

## Usage

### Options

| Option       | Default                        | Description         |
| ------------ | ------------------------------ | ------------------- |
| `outputFile` | `test-results/llm-report.json` | Path to JSON output |

### Console output

```text
.......F..........F.S....
26 tests | 23 passed | 2 failed | 1 skipped (4.2s)
Report: test-results/llm-report.json
```

### What to read, by task

| Task                         | Fields                                                                                                                                                           |
| ---------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Pass/fail overview           | `summary`                                                                                                                                                        |
| Triage failures              | Filter `tests[]` by `status === "failed"`, then read `errors[0].{message,diff,location,snippet}`                                                                 |
| Identify flakes              | Filter `tests[]` by `flaky === true`; compare `attempts[]` statuses                                                                                              |
| Reconstruct failure timeline | Pick an attempt where `status !== "passed"` (for flakes this is NOT the last attempt), then read `.timeline[]` (steps + network + console, sorted by `offsetMs`) |
| Inspect failing requests     | `tests[].attempts[].network.instances[]` — filter by `status >= 400`, or join `groups[groupId].{failureText,wasAborted}`                                         |
| Look up request body         | `tests[].attempts[].network.bodies[instance.requestBodyRef \| instance.responseBodyRef]`                                                                         |
| Correlate with backend trace | `tests[].attempts[].network.instances[].traceId` / `.spanId` / `.requestId` / `.correlationId`                                                                   |
| Debug uncaught page errors   | `tests[].attempts[].consoleMessages[]` — filter by `type` in `"error" \| "pageerror" \| "page-crashed"`                                                          |
| Visual debugging             | `tests[].attempts[].failureArtifacts.{screenshotBase64,videoPath}`                                                                                               |

### Minimal failure example

Walk `attempts[].timeline[]` (steps + network + console, sorted by `offsetMs`) to reconstruct the failure. Each timeline network entry carries a `networkId` you can resolve against `attempts[].network.instances[]` for full per-request detail and `attempts[].network.groups[]` / `bodies[]` for shared shape/payload context:

```json
{
  "schemaVersion": 3,
  "summary": {
    "total": 10,
    "passed": 9,
    "failed": 1,
    "flaky": 0,
    "skipped": 0,
    "timedOut": 0,
    "interrupted": 0
  },
  "tests": [
    {
      "id": "abc123",
      "title": "Checkout > applies discount code",
      "status": "failed",
      "flaky": false,
      "location": { "file": "tests/checkout.spec.ts", "line": 42, "column": 5 },
      "errors": [
        {
          "message": "Expected: 90\nReceived: 100",
          "diff": { "expected": "90", "actual": "100" },
          "location": { "file": "tests/checkout.spec.ts", "line": 58, "column": 7 }
        }
      ],
      "attempts": [
        {
          "attempt": 1,
          "status": "failed",
          "failureArtifacts": { "screenshotBase64": "iVBORw0KGgo...", "videoPath": "video.webm" },
          "timeline": [
            {
              "kind": "step",
              "offsetMs": 1050,
              "title": "click Apply",
              "category": "test.step",
              "durationMs": 40,
              "depth": 0
            },
            {
              "kind": "network",
              "offsetMs": 1100,
              "networkId": "n3",
              "method": "POST",
              "url": "https://api.example.com/discount",
              "status": 500
            },
            {
              "kind": "console",
              "offsetMs": 1240,
              "type": "pageerror",
              "text": "Uncaught TypeError: discount is undefined"
            },
            {
              "kind": "step",
              "offsetMs": 1300,
              "title": "expect total to equal 90",
              "category": "pw:api",
              "durationMs": 5,
              "depth": 0,
              "error": "Expected: 90\nReceived: 100"
            }
          ]
        }
      ]
    }
  ]
}
```

Reads as: click Apply → backend returned 500 → page threw → assertion failed. Resolve `networkId: "n3"` against `attempts[0].network.instances` for per-request `traceId` / `spanId` / `requestId` / body refs; `groups[instance.groupId]` holds the shape and aggregate counts (occurrences, first/last offset).

### Flaky test example (pass-vs-fail comparison)

For a test that fails on attempt 1 and passes on attempt 2, the divergence between the two timelines is the diagnosis. Find the first entry that differs:

```json
{
  "tests": [
    {
      "title": "Checkout > shows confirmation",
      "status": "passed",
      "flaky": true,
      "attempts": [
        {
          "attempt": 1,
          "status": "failed",
          "timeline": [
            {
              "kind": "step",
              "offsetMs": 800,
              "title": "goto /checkout",
              "category": "test.step",
              "durationMs": 120,
              "depth": 0
            },
            {
              "kind": "network",
              "offsetMs": 950,
              "networkId": "n0",
              "method": "GET",
              "url": "https://api.example.com/cart",
              "status": 200
            },
            {
              "kind": "step",
              "offsetMs": 1400,
              "title": "expect banner visible",
              "category": "pw:api",
              "durationMs": 5000,
              "depth": 0,
              "error": "Timeout 5000ms exceeded"
            }
          ]
        },
        {
          "attempt": 2,
          "status": "passed",
          "timeline": [
            {
              "kind": "step",
              "offsetMs": 800,
              "title": "goto /checkout",
              "category": "test.step",
              "durationMs": 120,
              "depth": 0
            },
            {
              "kind": "network",
              "offsetMs": 950,
              "networkId": "n0",
              "method": "GET",
              "url": "https://api.example.com/cart",
              "status": 200
            },
            {
              "kind": "network",
              "offsetMs": 1100,
              "networkId": "n1",
              "method": "GET",
              "url": "https://api.example.com/inventory",
              "status": 200
            },
            {
              "kind": "step",
              "offsetMs": 1350,
              "title": "expect banner visible",
              "category": "pw:api",
              "durationMs": 40,
              "depth": 0
            }
          ]
        }
      ]
    }
  ]
}
```

Divergence: the passing attempt made an extra `/inventory` call that the failing attempt didn't. That's either a stale frontend cache or a race — not a flaky test, a real bug.

### Full example report

See [`docs/example-report.json`](./docs/example-report.json) for a complete report with representative optional fields populated (network timings, redirect chains, headers, attachments, step nesting, multi-attempt retries).

### Field reference

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
- **`tests[].attempts[].network`** -- a three-layer `NetworkReport` that separates _instances_ (what happened), _groups_ (shared shape), and _bodies_ (payloads). Access patterns:
  - Filter `network.instances[]` by `status`, `redirectFromId`, `traceId`, etc. to find specific occurrences
  - Scan `network.groups[groupId]` for aggregate shape info (`resourceType`, `failureText`, `wasAborted`, `occurrenceCount`, `retainedInstanceCount`, `suppressedInstanceCount`, `evictedInstanceCount`, `firstOffsetMs`, `lastOffsetMs`)
  - Resolve `network.bodies[instance.requestBodyRef]` / `[instance.responseBodyRef]` for JSON/text payloads (2KB cap with `[truncated]` marker, `canonicalized: false` in v3.0)
  - `network.summary` gives end-to-end accounting: `observedInstances === retainedInstances + instancesDroppedByFilter + instancesDroppedByGroupCap + instancesDroppedByInstanceCap + instancesSuppressedAsDuplicate + instancesEvictedAfterAdmission`. For every group, `occurrenceCount === retainedInstanceCount + suppressedInstanceCount + evictedInstanceCount`
- **Retention policy** -- instances capped at 500, groups at 200, bodies at 100 per attempt. Low-signal static assets (script/stylesheet/image/font/media with 2xx and no failure) are dropped at the filter. Duplicates of the same shape are sampled: first 3 always admit, then 1-in-10. Under pressure, eviction is by priority tier (5xx > actionable connect/DNS/TLS failure > 4xx > successful xhr/fetch > plain aborted > unknown > other known > static asset) with strict `<` — ties reject rather than churn.
- **`tests[].attempts[].network.instances[].{traceId,spanId,requestId,correlationId}`** -- `traceId` and `spanId` parsed from the W3C Trace Context [`traceparent`](https://www.w3.org/TR/trace-context/) header (preferring response over request); `requestId` and `correlationId` from `x-request-id` / `x-correlation-id`. Compatible with OpenTelemetry and Datadog (dd-trace ≥ 2.0 emits `traceparent` by default). Malformed or all-zero `traceparent` values are rejected.
- **Redirects** -- `instance.redirectFromId` / `instance.redirectToId` reference sibling instance ids; walk the graph to reconstruct chains.
- **`tests[].attempts[].failureArtifacts`** -- for failing/timed-out/interrupted attempts: `screenshotBase64` (base64-encoded screenshot, max 512KB), `videoPath` (first video attachment path). Omitted entirely when neither screenshot nor video is available
- **`tests[].attachments[].path`** -- relative to Playwright outputDir
- **`tests[].stdout` / `tests[].stderr`** -- capped at 4KB with `[truncated]` marker

## Why not Playwright's built-in JSON reporter?

This library is specialized for agents:

- **JSON instead of markdown.** Other LLM-focused reporters emit a markdown summary, which is easy to read and hard to post-process. Agents can't cheaply filter to "just the failed tests" or "just 4xx/5xx requests on the failing attempt" without re-parsing prose. JSON with a flat, documented schema lets agents `jq` or index into exactly the fields they need.
- **Better flaky test diagnosis.** Full per-attempt retry history with a unified, time-ordered `timeline[]` of steps, network, and console on every attempt. The divergence between the failing and passing attempts is usually the diagnosis (see the [flaky test example](#flaky-test-example-pass-vs-fail-comparison)).
- **Better backend trace correlation.** `traceId` and `spanId` are parsed from W3C [`traceparent`](https://www.w3.org/TR/trace-context/) headers on every network request, so an agent can jump straight from a failing test to the backend trace in Datadog, Jaeger, Tempo, Honeycomb, or any OpenTelemetry-compatible backend.
- **Better signal filtering.** Network priority retention, console filtered, and headers allowlisted. An agent reading an unfiltered trace burns tokens on noise; this reporter does the filtering up front.

## Local development commands

See [`package.json`](./package.json) `scripts` for a list of commands.
