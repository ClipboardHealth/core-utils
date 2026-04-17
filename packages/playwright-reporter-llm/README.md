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
| Inspect failing requests     | `tests[].attempts[].network[]` — filter by `status >= 400`, `failureText`, or `wasAborted`                                                                       |
| Correlate with backend trace | `tests[].attempts[].network[].traceId` and `.spanId` (parsed from W3C `traceparent` — works with OpenTelemetry, Datadog, Jaeger, Tempo, Honeycomb, etc.)         |
| Debug uncaught page errors   | `tests[].attempts[].consoleMessages[]` — filter by `type` in `"error" \| "pageerror" \| "page-crashed"`                                                          |
| Visual debugging             | `tests[].attempts[].failureArtifacts.{screenshotBase64,videoPath}`                                                                                               |

### Minimal failure example

Walk `attempts[].timeline[]` (steps + network + console, sorted by `offsetMs`) to reconstruct the failure:

```json
{
  "schemaVersion": 2,
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
              "method": "POST",
              "url": "https://api.example.com/discount",
              "status": 500,
              "traceId": "4bf92f3577b34da6a3ce929d0e0e4736",
              "spanId": "00f067aa0ba902b7"
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

Reads as: click Apply → backend returned 500 → page threw → assertion failed. `traceId` lets you correlate the 500 with your tracing backend (Datadog, Jaeger, Tempo, Honeycomb, etc.).

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
              "method": "GET",
              "url": "https://api.example.com/cart",
              "status": 200
            },
            {
              "kind": "network",
              "offsetMs": 1100,
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

See [`docs/example-report.json`](./docs/example-report.json) for a complete report with every optional field populated (network timings, redirect chains, headers, attachments, step nesting, multi-attempt retries).

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
- **`tests[].attempts[].network[].traceId`** / **`spanId`** -- parsed from the W3C Trace Context [`traceparent`](https://www.w3.org/TR/trace-context/) header (preferring response over request). `traceId` is 32 hex chars (128-bit), `spanId` is 16 hex chars (64-bit). Compatible with OpenTelemetry and Datadog (dd-trace ≥ 2.0 emits `traceparent` by default). Malformed or all-zero values are rejected.
- **`tests[].attempts[].network[]`** -- max 200 per attempt, priority-based: fetch/xhr requests, error responses (status >= 400), failed, and aborted requests are retained over static assets (script, stylesheet, image, font, media). Includes failure details (`failureText`, `wasAborted`), redirect chain (`redirectToUrl`, `redirectFromUrl`, `redirectChain`), timing breakdown (`timings`), `durationMs` derived from available timing components, allowlisted headers (`requestHeaders`, `responseHeaders`), and JSON/text `requestBody` / `responseBody` pulled from the trace archive (capped at 2KB with `[truncated]` marker)
- **`tests[].attempts[].network[].requestHeaders`** / **`responseHeaders`** -- allowlisted only: `content-type`, `location` (response), `x-request-id`, `x-correlation-id`, `traceparent`, `tracestate`. Values capped at 256 chars.
- **`tests[].attempts[].failureArtifacts`** -- for failing/timed-out/interrupted attempts: `screenshotBase64` (base64-encoded screenshot, max 512KB), `videoPath` (first video attachment path). Omitted entirely when neither screenshot nor video is available
- **`tests[].attachments[].path`** -- relative to Playwright outputDir
- **`tests[].stdout` / `tests[].stderr`** -- capped at 4KB with `[truncated]` marker

## Local development commands

See [`package.json`](./package.json) `scripts` for a list of commands.
