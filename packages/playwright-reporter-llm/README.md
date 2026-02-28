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
  "schemaVersion": 1,
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
            { "title": "outer step", "category": "test.step", "durationMs": 20, "depth": 0 },
            {
              "title": "inner assertion",
              "category": "pw:api",
              "durationMs": 6,
              "depth": 1,
              "error": "Expected: 1, Received: 2"
            }
          ],
          "stdout": "",
          "stderr": "",
          "consoleMessages": [
            { "type": "warning", "text": "deprecated API used" },
            { "type": "error", "text": "failed to fetch" },
            { "type": "pageerror", "text": "Uncaught TypeError: x is undefined" }
          ],
          "attachments": [
            { "name": "trace", "contentType": "application/zip", "path": "trace.zip" }
          ],
          "network": [
            {
              "method": "POST",
              "url": "https://api.example.com/v1/orders",
              "status": 201,
              "durationMs": 37,
              "requestBody": "{\"orderId\":\"123\"}",
              "responseBody": "{\"ok\":true}"
            }
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
          "network": []
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
- **`tests[].attempts[].consoleMessages[]`** -- warning/error/pageerror trace console entries only (2KB text cap, max 50 per attempt)
- **`tests[].steps` / `tests[].network`** -- convenience aliases from the final attempt
- **`tests[].attempts[].network[].requestBody/responseBody`** -- JSON/text only, capped at 2KB
- **`tests[].attachments[].path`** -- relative to Playwright outputDir
- **`stdout`/`stderr`** -- capped at 4KB with `[truncated]` marker

## Local development commands

See [`package.json`](./package.json) `scripts` for a list of commands.
