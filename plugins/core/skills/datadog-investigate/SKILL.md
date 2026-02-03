---
name: datadog-investigate
description: Investigate production issues by querying Datadog logs, metrics, and APM traces, then correlating findings with the codebase
---

# Datadog Investigation Skill

Use this skill to investigate production issues by querying Datadog logs, metrics, and APM traces, then correlating findings with the codebase.

## Prerequisites

- Datadog CLI (`dog`) is installed and configured via `~/.dogrc`
- API credentials are configured with `apikey` and `appkey`

## Default Filters

**Always filter by `env:production` unless the user specifies a different environment.**

## Cross-Platform Time Calculations

Use Node.js for portable timestamp calculations (works on macOS and Linux):

````bash
# Seconds since epoch (now)
node -e "console.log(Math.floor(Date.now()/1000))"

# 1 hour ago
node -e "console.log(Math.floor(Date.now()/1000) - 3600)"

# 24 hours ago
node -e "console.log(Math.floor(Date.now()/1000) - 86400)"

# Example: query metrics for last hour
dog --pretty metric query "avg:system.cpu.user{service:my-service,env:production}" \
  $(node -e "console.log(Math.floor(Date.now()/1000) - 3600)") \
  $(node -e "console.log(Math.floor(Date.now()/1000))")

## Investigation Workflow

When investigating an issue:

1. **Clarify the problem** - Get service name, time range, error messages, or trace IDs from the user
2. **Query relevant data** - Start with logs, then correlate with metrics and traces
3. **Identify the code** - Use error messages, service names, and stack traces to find relevant code
4. **Propose a fix** - After understanding the issue, suggest code changes

## Querying Logs

Use the Logs Search API to query logs. Always ask the user for:

- Service name or source
- Time range (default to last 1 hour if not specified)
- Search terms (error messages, trace IDs, user IDs, etc.)

```bash
# Basic log search (last 15 minutes, production)
curl -s -X POST "https://api.datadoghq.com/api/v2/logs/events/search" \
  -H "Content-Type: application/json" \
  -H "DD-API-KEY: $(grep apikey ~/.dogrc | cut -d= -f2 | tr -d ' ')" \
  -H "DD-APPLICATION-KEY: $(grep appkey ~/.dogrc | cut -d= -f2 | tr -d ' ')" \
  -d '{
    "filter": {
      "query": "service:SERVICE_NAME status:error env:production",
      "from": "now-15m",
      "to": "now"
    },
    "sort": "-timestamp",
    "page": {
      "limit": 50
    }
  }' | jq '.data[] | {timestamp: .attributes.timestamp, message: .attributes.message, status: .attributes.status, service: .attributes.service}'
````

### Common Log Queries

All queries should include `env:production` by default:

```bash
# Search by service and error status
"service:my-service status:error env:production"

# Search by trace ID (for correlation)
"trace_id:123456789 env:production"

# Search by specific error message
"service:my-service \"NullPointerException\" env:production"

# Search by host
"service:my-service host:ip-10-0-1-123 env:production"

# Combine multiple conditions
"service:my-service status:error env:production @http.status_code:500"
```

### Time Range Formats

- Relative: `now-15m`, `now-1h`, `now-24h`, `now-7d`
- Absolute ISO 8601: `2024-01-15T10:00:00Z`

## Querying Metrics

Use the `dog` CLI for metrics:

```bash
# Query a metric (last hour, production)
dog --pretty metric query "avg:system.cpu.user{service:my-service,env:production}" $(date -v-1H +%s) $(date +%s)

# Query with specific tags
dog --pretty metric query "avg:trace.http.request.duration{service:my-service,env:production}" $(date -v-1H +%s) $(date +%s)

# Common metric patterns
dog --pretty metric query "sum:trace.http.request.errors{service:my-service,env:production}.as_count()" $(date -v-1H +%s) $(date +%s)
dog --pretty metric query "avg:trace.http.request.duration{service:my-service,env:production}" $(date -v-1H +%s) $(date +%s)
```

## Querying APM Traces

Use the Traces API to search for specific traces:

```bash
# Search traces by service (last 15 minutes, production)
curl -s -X POST "https://api.datadoghq.com/api/v2/spans/events/search" \
  -H "Content-Type: application/json" \
  -H "DD-API-KEY: $(grep apikey ~/.dogrc | cut -d= -f2 | tr -d ' ')" \
  -H "DD-APPLICATION-KEY: $(grep appkey ~/.dogrc | cut -d= -f2 | tr -d ' ')" \
  -d '{
    "filter": {
      "query": "service:SERVICE_NAME @http.status_code:500 env:production",
      "from": "now-15m",
      "to": "now"
    },
    "sort": "-timestamp",
    "page": {
      "limit": 25
    }
  }' | jq '.data[] | {trace_id: .attributes.attributes.trace_id, resource: .attributes.resource_name, duration_ns: .attributes.duration, status: .attributes.attributes["http.status_code"]}'
```

### Get a Specific Trace by ID

```bash
# Get trace details
curl -s -X GET "https://api.datadoghq.com/api/v1/trace/TRACE_ID" \
  -H "DD-API-KEY: $(grep apikey ~/.dogrc | cut -d= -f2 | tr -d ' ')" \
  -H "DD-APPLICATION-KEY: $(grep appkey ~/.dogrc | cut -d= -f2 | tr -d ' ')" | jq '.'
```

## Querying Monitors

Check monitor status for a service:

```bash
# List all monitors
dog --pretty monitor show_all

# Show specific monitor
dog --pretty monitor show MONITOR_ID

# Search monitors by tag or name (use jq to filter)
dog --pretty monitor show_all | jq '.monitors[] | select(.name | contains("my-service"))'
```

## Querying Events

Check events (deployments, alerts, etc.):

```bash
# Stream events from the last hour
dog --pretty event stream --start 1h

# Stream events with specific tags
dog --pretty event stream --start 1h --tags "service:my-service,env:production"
```

## Correlating with the Codebase

After finding errors in Datadog, correlate with code:

1. **Extract service name** - Map to the correct repository/directory
2. **Find error origin** - Search for:
   - Error message text in the codebase
   - Exception class names
   - Resource/endpoint names from traces
   - Log message patterns
3. **Trace the call stack** - Use function/method names from stack traces to locate code

### Search Patterns

```bash
# Search for error message in code
grep -r "Error message from logs" src/

# Search for endpoint/resource
grep -r "/api/endpoint/path" src/

# Search for exception handling
grep -r "SpecificException" src/
```

## Example Investigation Flow

When a user reports an issue:

1. **Get context**: "What service? What time did this happen? Any error messages or IDs?"

2. **Query logs first** (always include env:production):

```bash
curl -s -X POST "https://api.datadoghq.com/api/v2/logs/events/search" \
  -H "Content-Type: application/json" \
  -H "DD-API-KEY: $(grep apikey ~/.dogrc | cut -d= -f2 | tr -d ' ')" \
  -H "DD-APPLICATION-KEY: $(grep appkey ~/.dogrc | cut -d= -f2 | tr -d ' ')" \
  -d '{"filter": {"query": "service:SERVICE status:error env:production", "from": "now-1h", "to": "now"}, "sort": "-timestamp", "page": {"limit": 20}}' | jq '.data[].attributes | {timestamp, message, status}'
```

3. **Get trace IDs from logs**, then query traces for full context

4. **Check metrics** for patterns (error rates, latency spikes)

5. **Search codebase** for the error source using messages/stack traces

6. **Propose fix** based on findings

## Helper Functions

For convenience, you can use these one-liners:

```bash
# Quick log search function (defaults to env:production)

dd_logs() {
  local query="$1"
  # Only append env:production if no env: filter is already present
  if [[ ! "$query" =~ env: ]]; then
    query="$query env:production"
  fi
  local limit="${3:-25}"
  jq -n --arg q "$query" --arg from "${2:-now-1h}" --argjson limit "$limit" \
    '{filter: {query: $q, from: $from, to: "now"}, sort: "-timestamp", page: {limit: $limit}}' | \
  curl -s -X POST "https://api.datadoghq.com/api/v2/logs/events/search" \
    -H "Content-Type: application/json" \
    -H "DD-API-KEY: $(grep apikey ~/.dogrc | cut -d= -f2 | tr -d ' ')" \
    -H "DD-APPLICATION-KEY: $(grep appkey ~/.dogrc | cut -d= -f2 | tr -d ' ')" \
    -d @-
}


# Usage: dd_logs "service:my-service status:error" "now-15m" 10
```

## Pagination

API responses are paginated. To retrieve more results:

```bash
# First request returns a cursor in the response
response=$(curl -s -X POST "https://api.datadoghq.com/api/v2/logs/events/search" \
  -H "Content-Type: application/json" \
  -H "DD-API-KEY: $(grep apikey ~/.dogrc | cut -d= -f2 | tr -d ' ')" \
  -H "DD-APPLICATION-KEY: $(grep appkey ~/.dogrc | cut -d= -f2 | tr -d ' ')" \
  -d '{"filter": {"query": "service:my-service env:production", "from": "now-1h", "to": "now"}, "page": {"limit": 50}}')

# Extract cursor for next page
cursor=$(echo "$response" | jq -r '.meta.page.after // empty')

# If cursor exists, fetch next page
if [ -n "$cursor" ]; then
  curl -s -X POST "https://api.datadoghq.com/api/v2/logs/events/search" \
    -H "Content-Type: application/json" \
    -H "DD-API-KEY: $(grep apikey ~/.dogrc | cut -d= -f2 | tr -d ' ')" \
    -H "DD-APPLICATION-KEY: $(grep appkey ~/.dogrc | cut -d= -f2 | tr -d ' ')" \
    -d '{"filter": {"query": "service:my-service env:production", "from": "now-1h", "to": "now"}, "page": {"limit": 50, "cursor": "'"$cursor"'"}}'
fi
```

## Handling Common Issues

| Error                   | Cause                                | Solution                                                    |
| ----------------------- | ------------------------------------ | ----------------------------------------------------------- |
| Empty results           | Query too narrow or wrong time range | Expand time range (`now-24h`), remove filters one at a time |
| 401 Unauthorized        | Invalid or missing API key           | Verify `~/.dogrc` has valid `apikey` and `appkey`           |
| 403 Forbidden           | API key lacks required permissions   | Check Datadog org settings for API key scopes               |
| 429 Too Many Requests   | Rate limited                         | Wait 30 seconds, reduce `page.limit`, narrow time range     |
| Timeout / slow response | Query spans too much data            | Narrow time range, add more specific filters                |

## Important Notes

- **Always filter by `env:production`** unless the user explicitly specifies a different environment
- Always use `jq` to format JSON output for readability
- Default to the last 1 hour for time ranges unless specified
- When correlating with code, prioritize Serena's symbolic tools (`find_symbol`, `search_for_pattern`) over grep
- Log messages may contain sensitive data - summarize findings without exposing PII
- If no results found, expand the time range or broaden the query
