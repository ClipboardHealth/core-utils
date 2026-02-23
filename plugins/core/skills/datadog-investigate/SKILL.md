---
name: datadog-investigate
description: Investigate production issues by querying Datadog logs, metrics, and APM traces, then correlating findings with the codebase. Use this skill whenever the user mentions production errors, Datadog, observability, log investigation, latency spikes, error rate increases, 500s, trace IDs, monitor alerts, or wants to debug any service issue in a deployed environment.
---

# Datadog Investigation Skill

Investigate production issues by querying Datadog logs, metrics, and APM traces, then correlating findings with the codebase.

## Prerequisites

- Datadog CLI (`dog`) installed and configured via `~/.dogrc` with `apikey` and `appkey`

## Setup: API Credentials

Every Datadog API call needs authentication. Extract credentials once and reuse them to keep commands readable:

```bash
DD_API_KEY=$(grep apikey ~/.dogrc | cut -d= -f2 | tr -d ' ')
DD_APP_KEY=$(grep appkey ~/.dogrc | cut -d= -f2 | tr -d ' ')
```

Use these variables in all subsequent curl calls. If a shell session is lost, re-extract them.

## Default Environment

Filter by `env:production` unless the user specifies otherwise. Production is the default because that's where real user-impacting issues live — staging and dev issues rarely warrant this investigation workflow.

## Timestamps

Use Node.js for portable timestamp calculations (works on macOS and Linux):

```bash
node -e "console.log(Math.floor(Date.now()/1000))"          # now
node -e "console.log(Math.floor(Date.now()/1000) - 3600)"   # 1 hour ago
node -e "console.log(Math.floor(Date.now()/1000) - 86400)"  # 24 hours ago
```

## Investigation Workflow

When a user reports an issue, follow this flow. The goal is to move from symptoms to root cause to fix as quickly as possible.

1. **Clarify the problem** — Get service name, time range, error messages, or trace IDs. If the user is vague, start with the last hour of errors for their service.

2. **Query logs first** — Logs are the richest signal. Look for error patterns, stack traces, and trace IDs.

3. **Correlate with traces** — Use trace IDs from logs to get the full request lifecycle. This reveals which downstream service or operation actually failed.

4. **Check metrics** — Look for error rate spikes, latency increases, or resource exhaustion that coincide with the issue timeframe.

5. **Find the code** — Use error messages, stack traces, and endpoint paths to locate the relevant code. Use Serena's symbolic tools (`find_symbol`, `search_for_pattern`) rather than grep — they understand code structure and give better results.

6. **Propose a fix** — After understanding the root cause, suggest targeted code changes.

## Querying Logs

Use the Logs Search API. Default to the last 1 hour if the user doesn't specify a time range.

```bash
curl -s -X POST "https://api.datadoghq.com/api/v2/logs/events/search" \
  -H "Content-Type: application/json" \
  -H "DD-API-KEY: $DD_API_KEY" \
  -H "DD-APPLICATION-KEY: $DD_APP_KEY" \
  -d '{
    "filter": {
      "query": "service:SERVICE_NAME status:error env:production",
      "from": "now-1h",
      "to": "now"
    },
    "sort": "-timestamp",
    "page": { "limit": 50 }
  }' | jq '.data[] | {timestamp: .attributes.timestamp, message: .attributes.message, status: .attributes.status, service: .attributes.service}'
```

### Common Query Patterns

```text
service:my-service status:error env:production
trace_id:123456789 env:production
service:my-service "NullPointerException" env:production
service:my-service host:ip-10-0-1-123 env:production
service:my-service status:error env:production @http.status_code:500
```

### Time Range Formats

- Relative: `now-15m`, `now-1h`, `now-24h`, `now-7d`
- Absolute ISO 8601: `2024-01-15T10:00:00Z`

### Pagination

API responses are paginated. Extract the cursor from the response to fetch more:

```bash
response=$(curl -s -X POST "https://api.datadoghq.com/api/v2/logs/events/search" \
  -H "Content-Type: application/json" \
  -H "DD-API-KEY: $DD_API_KEY" \
  -H "DD-APPLICATION-KEY: $DD_APP_KEY" \
  -d '{"filter": {"query": "service:my-service env:production", "from": "now-1h", "to": "now"}, "page": {"limit": 50}}')

cursor=$(echo "$response" | jq -r '.meta.page.after // empty')

if [ -n "$cursor" ]; then
  curl -s -X POST "https://api.datadoghq.com/api/v2/logs/events/search" \
    -H "Content-Type: application/json" \
    -H "DD-API-KEY: $DD_API_KEY" \
    -H "DD-APPLICATION-KEY: $DD_APP_KEY" \
    -d '{"filter": {"query": "service:my-service env:production", "from": "now-1h", "to": "now"}, "page": {"limit": 50, "cursor": "'"$cursor"'"}}'
fi
```

## Querying Metrics

Use the `dog` CLI for metrics. Metrics are useful for spotting patterns (error rate spikes, latency increases) that logs alone might not reveal.

```bash
# CPU usage for a service (last hour)
dog --pretty metric query "avg:system.cpu.user{service:my-service,env:production}" \
  $(node -e "console.log(Math.floor(Date.now()/1000) - 3600)") \
  $(node -e "console.log(Math.floor(Date.now()/1000))")

# Request duration
dog --pretty metric query "avg:trace.http.request.duration{service:my-service,env:production}" \
  $(node -e "console.log(Math.floor(Date.now()/1000) - 3600)") \
  $(node -e "console.log(Math.floor(Date.now()/1000))")

# Error count
dog --pretty metric query "sum:trace.http.request.errors{service:my-service,env:production}.as_count()" \
  $(node -e "console.log(Math.floor(Date.now()/1000) - 3600)") \
  $(node -e "console.log(Math.floor(Date.now()/1000))")
```

## Querying APM Traces

Use the Traces API to get the full request lifecycle for specific requests.

```bash
curl -s -X POST "https://api.datadoghq.com/api/v2/spans/events/search" \
  -H "Content-Type: application/json" \
  -H "DD-API-KEY: $DD_API_KEY" \
  -H "DD-APPLICATION-KEY: $DD_APP_KEY" \
  -d '{
    "filter": {
      "query": "service:SERVICE_NAME @http.status_code:500 env:production",
      "from": "now-15m",
      "to": "now"
    },
    "sort": "-timestamp",
    "page": { "limit": 25 }
  }' | jq '.data[] | {trace_id: .attributes.attributes.trace_id, resource: .attributes.resource_name, duration_ns: .attributes.duration, status: .attributes.attributes["http.status_code"]}'
```

### Get a Specific Trace

```bash
curl -s -X GET "https://api.datadoghq.com/api/v1/trace/TRACE_ID" \
  -H "DD-API-KEY: $DD_API_KEY" \
  -H "DD-APPLICATION-KEY: $DD_APP_KEY" | jq '.'
```

## Querying Monitors and Events

```bash
# List all monitors
dog --pretty monitor show_all

# Show specific monitor
dog --pretty monitor show MONITOR_ID

# Search monitors by name
dog --pretty monitor show_all | jq '.monitors[] | select(.name | contains("my-service"))'

# Recent events (deployments, alerts)
dog --pretty event stream --start 1h --tags "service:my-service,env:production"
```

## Helper: Quick Log Search

For repeated log searches, this function avoids re-typing the full curl command:

```bash
dd_logs() {
  local query="$1"
  [[ ! "$query" =~ env: ]] && query="$query env:production"
  local limit="${3:-25}"
  jq -n --arg q "$query" --arg from "${2:-now-1h}" --argjson limit "$limit" \
    '{filter: {query: $q, from: $from, to: "now"}, sort: "-timestamp", page: {limit: $limit}}' | \
  curl -s -X POST "https://api.datadoghq.com/api/v2/logs/events/search" \
    -H "Content-Type: application/json" \
    -H "DD-API-KEY: $DD_API_KEY" \
    -H "DD-APPLICATION-KEY: $DD_APP_KEY" \
    -d @-
}

# Usage: dd_logs "service:my-service status:error" "now-15m" 10
```

## Troubleshooting

| Error                 | Likely Cause                         | Fix                                                         |
| --------------------- | ------------------------------------ | ----------------------------------------------------------- |
| Empty results         | Query too narrow or wrong time range | Expand time range (`now-24h`), remove filters one at a time |
| 401 Unauthorized      | Invalid or missing API key           | Verify `~/.dogrc` has valid `apikey` and `appkey`           |
| 403 Forbidden         | API key lacks permissions            | Check Datadog org settings for API key scopes               |
| 429 Too Many Requests | Rate limited                         | Wait 30 seconds, reduce `page.limit`, narrow time range     |
| Timeout               | Query spans too much data            | Narrow time range, add more specific filters                |

## Important Notes

- Use `jq` to format all JSON output — raw API responses are unreadable
- Log messages may contain sensitive data — summarize findings without exposing PII
- If no results found, expand the time range or broaden the query before concluding the data doesn't exist
