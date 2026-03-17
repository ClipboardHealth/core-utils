---
name: datadog-e2e-trace
description: >
  Fetch and display the full APM trace for a Datadog CI test run from a Datadog UI URL.
  Use this skill whenever the user pastes a Datadog CI test URL, asks to investigate an E2E
  test failure trace, wants to see what happened during a CI test run, or mentions pulling
  spans/traces from Datadog CI Visibility.
argument-hint: "<datadog-ci-test-url>"
---

# Datadog E2E Test Trace

Fetch the full APM trace for a Datadog CI Visibility test run, given a Datadog UI URL.

## Arguments

- `$ARGUMENTS` — A Datadog CI test URL (e.g., `https://app.datadoghq.com/ci/test/...?...&spanID=123456&...`)

## Prerequisites

`DD_API_KEY` and `DD_APP_KEY` environment variables, or `~/.dogrc`:

```ini
[Connection]
apikey = <your-api-key>
appkey = <your-app-key>
```

## Steps

### 1. Extract the `spanID` from the URL

Parse the `spanID` query parameter from the URL. This is a decimal span ID.

If the URL has no `spanID`, stop and tell the user: the test run has no associated trace. This typically happens when Datadog RUM is active during E2E tests, which suppresses CI test traces.

### 2. Resolve API credentials

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

### 3. Fetch the span to get the `trace_id`

Query the Spans API. The request body **must** use the wrapped `data` format shown below — the flat `{"filter": ...}` format returns 400:

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

If the query returns no results (empty `.data` array), the span exists only in the CI Visibility index and is not available in APM. Tell the user:

> The span was not found in the APM Spans index — it likely exists only in CI Visibility (e.g., a browser-side or Playwright test span). To fetch a backend trace, open the flamegraph in the Datadog UI, click on a **backend span** (e.g., an API endpoint from a server-side service, not a browser HTTP request), copy the updated URL, and run this skill again.

Stop here — do not proceed to step 4.

**Note:** The `index=citest` parameter sometimes present in the URL only controls the Datadog UI view. It does not mean the span is inaccessible via the Spans API. Backend spans (e.g., `express.request`) are often in both the CI Visibility flamegraph and the APM spans index. Always attempt the query regardless of that parameter.

### 4. Fetch the full trace

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

### 5. Display the results

Start with a one-line summary: total span count and trace duration (max end time minus min start time).

Then present a table of spans grouped by type. Mark any span with error status or non-2xx status code with a warning indicator.

| Type                                                  | Columns                                       |
| ----------------------------------------------------- | --------------------------------------------- |
| **API endpoints** (type: `web`)                       | resource name, service, duration, status code |
| **External HTTP calls** (type: `http`)                | resource, service, duration, status code, URL |
| **Database queries** (type: `mongodb`, `redis`, etc.) | resource, service, duration                   |
| **Other spans**                                       | resource, service, type, duration             |

If there are errors, call them out at the top before the table so the user sees them immediately.
