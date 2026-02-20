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

### Step 2: Resolve API credentials

```bash
if [ -n "$DD_API_KEY" ] && [ -n "$DD_APP_KEY" ]; then
  API_KEY="$DD_API_KEY"
  APP_KEY="$DD_APP_KEY"
else
  API_KEY=$(grep apikey ~/.dogrc | cut -d= -f2 | tr -d ' ')
  APP_KEY=$(grep appkey ~/.dogrc | cut -d= -f2 | tr -d ' ')
fi
```

Use `$API_KEY` and `$APP_KEY` in all subsequent curl commands.

### Step 3: Fetch the span to get the `trace_id`

Query the Datadog Spans API using the **wrapped data format** (the flat format returns 400):

```bash
curl -s -X POST "https://api.datadoghq.com/api/v2/spans/events/search" \
  -H "Content-Type: application/json" \
  -H "DD-API-KEY: ${API_KEY}" \
  -H "DD-APPLICATION-KEY: ${APP_KEY}" \
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

If the query returns no results (empty `.data` array), the span exists only in the CI Visibility index and is not available in APM. Inform the user:

> The span was not found in the APM Spans index — it likely exists only in CI Visibility (e.g., a browser-side or Playwright test span). To fetch a backend trace, open the flamegraph in the Datadog UI, click on a **backend span** (e.g., an API endpoint from a server-side service, not a browser HTTP request), copy the updated URL, and run this skill again.

Then stop.

### Step 4: Fetch the full trace

Use the `trace_id` to retrieve all spans in the trace. Paginate until all spans are collected:

```bash
ALL_SPANS="[]"
CURSOR=""

while true; do
  if [ -n "$CURSOR" ]; then
    PAGE_PARAM="\"cursor\": \"${CURSOR}\","
  else
    PAGE_PARAM=""
  fi

  RESPONSE=$(curl -s -X POST "https://api.datadoghq.com/api/v2/spans/events/search" \
    -H "Content-Type: application/json" \
    -H "DD-API-KEY: ${API_KEY}" \
    -H "DD-APPLICATION-KEY: ${APP_KEY}" \
    -d "{
      \"data\": {
        \"type\": \"search_request\",
        \"attributes\": {
          \"filter\": {
            \"query\": \"trace_id:<TRACE_ID>\",
            \"from\": \"now-30d\",
            \"to\": \"now\"
          },
          \"sort\": \"timestamp\",
          \"page\": {
            ${PAGE_PARAM}
            \"limit\": 50
          }
        }
      }
    }")

  ALL_SPANS=$(echo "$ALL_SPANS" | jq --argjson new "$(echo "$RESPONSE" | jq '.data')" '. + $new')
  CURSOR=$(echo "$RESPONSE" | jq -r '.meta.page.after // empty')

  if [ -z "$CURSOR" ]; then
    break
  fi
done
```

### Step 5: Display the results

Present a summary table of the trace, grouped by type:

1. **API endpoints** (type: `web`) - show resource name, service, duration, status code
2. **External HTTP calls** (type: `http`) - show resource, service, duration, status code, URL
3. **Database queries** (type: `mongodb`, `redis`, etc.) - show resource, service, duration

Highlight any spans with error status or non-2xx status codes.

## Important Notes

- The Spans API **requires the wrapped `data` format**: `{"data": {"type": "search_request", "attributes": {"filter": ...}}}`. The flat `{"filter": ...}` format that works for CI test events will return a 400 error for spans.
- The `spanID` in the Datadog UI URL is the bridge between CI Visibility and APM traces.
- If no `spanID` is present in the URL, the test has no associated trace data.
- The `index=citest` parameter in the URL only indicates the Datadog UI view — it does **not** mean the span is inaccessible via the Spans API. Backend spans (e.g., `express.request` on a server service) are often present in both the CI Visibility flamegraph and the APM spans index. Always attempt the Spans API query regardless of the `index` parameter.
