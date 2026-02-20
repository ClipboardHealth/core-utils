---
name: datadog-e2e-trace
description: Fetch and display the full trace for a Datadog CI test run from a Datadog UI URL
argument-hint: "<datadog-ci-test-url>"
---

# Datadog E2E Test Trace

Fetch the full APM trace for a Datadog CI Visibility test run, given a Datadog UI URL.

## Arguments

- `$ARGUMENTS` - A Datadog CI test URL (e.g., `https://app.datadoghq.com/ci/test/...?...&spanID=123456&...`)

## Prerequisites

- `~/.dogrc` must exist with valid `apikey` and `appkey`, or `DD_API_KEY` and `DD_APP_KEY` environment variables must be set

```ini
[Connection]
apikey = <your-api-key>
appkey = <your-app-key>
```

## How It Works

### Step 1: Extract the `spanID` from the URL

Parse the `spanID` query parameter from the Datadog UI URL. This is a decimal span ID.

If the URL does not contain a `spanID` parameter, inform the user that the test run has no associated trace (this typically happens when Datadog RUM is active during E2E tests, which suppresses CI test traces).

### Step 2: Fetch the span to get the `trace_id`

Query the Datadog Spans API using the **wrapped data format** (the flat format returns 400):

```bash
curl -s -X POST "https://api.datadoghq.com/api/v2/spans/events/search" \
  -H "Content-Type: application/json" \
  -H "DD-API-KEY: $(grep apikey ~/.dogrc | cut -d= -f2 | tr -d ' ')" \
  -H "DD-APPLICATION-KEY: $(grep appkey ~/.dogrc | cut -d= -f2 | tr -d ' ')" \
  -d '{
    "data": {
      "type": "search_request",
      "attributes": {
        "filter": {
          "query": "span_id:<SPAN_ID>",
          "from": "now-30d",
          "to": "now"
        },
        "page": {
          "limit": 1
        }
      }
    }
  }'
```

Extract `trace_id` from `.data[0].attributes.trace_id`.

If `DD_API_KEY` / `DD_APP_KEY` env vars are available, use those instead of reading from `~/.dogrc`.

### Step 3: Fetch the full trace

Use the `trace_id` to retrieve all spans in the trace:

```bash
curl -s -X POST "https://api.datadoghq.com/api/v2/spans/events/search" \
  -H "Content-Type: application/json" \
  -H "DD-API-KEY: $(grep apikey ~/.dogrc | cut -d= -f2 | tr -d ' ')" \
  -H "DD-APPLICATION-KEY: $(grep appkey ~/.dogrc | cut -d= -f2 | tr -d ' ')" \
  -d '{
    "data": {
      "type": "search_request",
      "attributes": {
        "filter": {
          "query": "trace_id:<TRACE_ID>",
          "from": "now-30d",
          "to": "now"
        },
        "sort": "timestamp",
        "page": {
          "limit": 50
        }
      }
    }
  }'
```

If there are more than 50 spans, paginate using the cursor from `.meta.page.after`.

### Step 4: Display the results

Present a summary table of the trace, grouped by type:

1. **API endpoints** (type: `web`) - show resource name, service, duration, status code
2. **External HTTP calls** (type: `http`) - show resource, service, duration, status code, URL
3. **Database queries** (type: `mongodb`, `redis`, etc.) - show resource, service, duration

Highlight any spans with error status or non-2xx status codes.

## Important Notes

- The Spans API **requires the wrapped `data` format**: `{"data": {"type": "search_request", "attributes": {"filter": ...}}}`. The flat `{"filter": ...}` format that works for CI test events will return a 400 error for spans.
- The `spanID` in the Datadog UI URL is the bridge between CI Visibility and APM traces.
- If no `spanID` is present in the URL, the test has no associated trace data.
