# @clipboard-health/playwright-reporter-llm <!-- omit from toc -->

Playwright reporter that outputs structured JSON for LLM agents. Minimal console output, flat schema, easy to filter to failures.

## Table of contents <!-- omit from toc -->

- [Install](#install)
- [Usage](#usage)
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

### Report schema

```json
{
  "schemaVersion": 2,
  "timestamp": "2026-02-25T19:00:00.000Z",
  "durationMs": 4200,
  "summary": {
    "total": 26,
    "passed": 23,
    "failed": 2,
    "flaky": 0,
    "skipped": 1,
    "timedOut": 0,
    "interrupted": 0
  },
  "environment": {
    "playwrightVersion": "1.58.2",
    "nodeVersion": "v24.13.1",
    "os": "darwin",
    "workers": 4,
    "retries": 1,
    "projects": ["chromium"]
  },
  "tests": [
    {
      "id": "abc123",
      "title": "Suite > passes on retry",
      "status": "passed",
      "flaky": true,
      "durationMs": 88,
      "location": { "file": "tests/example.spec.ts", "line": 10, "column": 5 },
      "project": "chromium",
      "tags": [],
      "annotations": [],
      "retries": 1,
      "errors": [],
      "attachments": [],
      "stdout": "",
      "stderr": "",
      "steps": [],
      "network": [],
      "timeline": [],
      "attempts": [
        {
          "attempt": 1,
          "status": "failed",
          "durationMs": 44,
          "startTime": "2026-02-25T19:00:00.000Z",
          "workerIndex": 0,
          "parallelIndex": 0,
          "error": {
            "message": "Expected: 1, Received: 2"
          },
          "steps": [
            {
              "title": "outer step",
              "category": "test.step",
              "durationMs": 20,
              "depth": 0,
              "offsetMs": 100
            },
            {
              "title": "inner assertion",
              "category": "pw:api",
              "durationMs": 6,
              "depth": 1,
              "offsetMs": 120,
              "error": "Expected: 1, Received: 2"
            }
          ],
          "stdout": "",
          "stderr": "",
          "consoleMessages": [
            { "type": "warning", "text": "deprecated API used", "offsetMs": 150 },
            { "type": "error", "text": "failed to fetch", "offsetMs": 200 },
            { "type": "pageerror", "text": "Uncaught TypeError: x is undefined", "offsetMs": 250 },
            { "type": "page-closed", "text": "Page closed", "offsetMs": 300 }
          ],
          "attachments": [
            { "name": "trace", "contentType": "application/zip", "path": "trace.zip" }
          ],
          "failureArtifacts": {
            "screenshotBase64": "iVBORw0KGgo...",
            "videoPath": "retry-video.webm"
          },
          "network": [
            {
              "method": "GET",
              "url": "https://app.example.com/start",
              "status": 302,
              "durationMs": 27,
              "offsetMs": 50,
              "traceId": "12345",
              "redirectToUrl": "https://app.example.com/final",
              "redirectChain": [
                { "url": "https://app.example.com/start", "status": 302 },
                { "url": "https://app.example.com/final", "status": 200 }
              ],
              "timings": {
                "dnsMs": 2,
                "connectMs": 7,
                "sslMs": 4,
                "sendMs": 1,
                "waitMs": 12,
                "receiveMs": 5
              },
              "requestHeaders": {
                "content-type": "application/json"
              },
              "responseHeaders": {
                "location": "https://app.example.com/final",
                "x-datadog-trace-id": "12345",
                "x-datadog-span-id": "67890"
              }
            }
          ],
          "timeline": [
            {
              "kind": "network",
              "offsetMs": 50,
              "method": "GET",
              "url": "https://app.example.com/start",
              "status": 302,
              "durationMs": 27,
              "traceId": "12345"
            },
            {
              "kind": "step",
              "offsetMs": 100,
              "title": "outer step",
              "category": "test.step",
              "durationMs": 20,
              "depth": 0
            },
            {
              "kind": "step",
              "offsetMs": 120,
              "title": "inner assertion",
              "category": "pw:api",
              "durationMs": 6,
              "depth": 1,
              "error": "Expected: 1, Received: 2"
            },
            {
              "kind": "console",
              "offsetMs": 150,
              "type": "warning",
              "text": "deprecated API used"
            },
            { "kind": "console", "offsetMs": 200, "type": "error", "text": "failed to fetch" },
            {
              "kind": "console",
              "offsetMs": 250,
              "type": "pageerror",
              "text": "Uncaught TypeError: x is undefined"
            },
            { "kind": "console", "offsetMs": 300, "type": "page-closed", "text": "Page closed" }
          ]
        },
        {
          "attempt": 2,
          "status": "passed",
          "durationMs": 88,
          "startTime": "2026-02-25T19:00:01.000Z",
          "workerIndex": 0,
          "parallelIndex": 0,
          "steps": [],
          "stdout": "",
          "stderr": "",
          "consoleMessages": [],
          "attachments": [],
          "network": [],
          "timeline": []
        }
      ]
    }
  ],
  "globalErrors": []
}
```

Key fields for agents:

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

## Local development commands

See [`package.json`](./package.json) `scripts` for a list of commands.
