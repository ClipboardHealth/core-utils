# Datadog APM Traces

Fetch and display the full APM trace for a given trace ID, or look up a specific span by span ID.

## Prerequisites

The `pup` CLI must be installed and authenticated. Two auth paths are supported:

- **macOS Keychain** (via `pup auth login`) — the default on developer machines.
- **Environment variables** (`DD_API_KEY` + `DD_APP_KEY`) — the path used in sandboxes and CI.

Don't run `pup auth status` to verify auth. It fails in sandboxes even when env-var auth is working. Call `pup traces search …` directly. If the query fails with an auth error, check `DD_API_KEY` / `DD_APP_KEY` or run `pup auth login`.

## Key pup conventions

- **Durations are in NANOSECONDS**: 1 second = 1,000,000,000 ns; 5ms = 5,000,000 ns. Convert to ms for display by dividing by 1,000,000.
- **Default time range is 1h.** Always pass `--from` explicitly — use `--from=7d` or `--from=30d` for older traces.
- **Default output is JSON.** Pipe JSON through `jq` for extraction.
- **`--limit` defaults to 50.** Max is 1000. For large traces, you may need multiple paginated calls (but pup handles most pagination internally).
- **Query syntax for traces:** `service:<name> resource_name:<path> @duration:>5s env:production status:error operation_name:<op>`

## Steps

### 1. If a span ID was provided, fetch that span first

```bash
pup traces search --query="span_id:<SPAN_ID>" --from=30d --limit=1
```

Display the span's details (service, operation, resource, duration, status, error if any) before proceeding to fetch the full trace.

If the query returns no results, tell the user the span was not found in the APM Spans index. Continue to step 2 using the trace ID from the arguments.

### 2. Fetch the full trace

Use the `trace_id` to retrieve all spans in the trace:

```bash
pup traces search --query="trace_id:<TRACE_ID>" --from=30d --limit=1000
```

If the trace has more than 1000 spans, the response will be truncated. In that case, narrow the query by adding filters like `service:<name>` or `status:error` to focus on relevant spans.

### 3. Parse and summarize the results

The response JSON has this structure per span:

```text
.data[].attributes:
  .span_id          — unique span identifier
  .trace_id         — shared across all spans in the trace
  .parent_id        — parent span (for building the call tree)
  .service          — service name (e.g., "cbh-backend-main")
  .operation_name   — operation (e.g., "express.request", "express.middleware", "http.request")
  .resource_name    — resource (e.g., "GET /api/v1/users", "<anonymous>")
  .status           — "ok" or "error"
  .start_timestamp  — ISO 8601 start time
  .end_timestamp    — ISO 8601 end time
  .custom.duration  — duration in NANOSECONDS (divide by 1,000,000 for ms)
  .custom.env       — environment (e.g., "staging", "production")
  .custom.error     — error object with .message, .file, .fingerprint (null if no error)
  .custom.type      — span type (e.g., "web", "http", "mongodb", "redis", "worker")
  .custom.service   — service name (also at top level)
  .tags[]           — array of tag strings
```

Use `jq` to extract a useful summary. Example:

```bash
# Quick error summary
pup traces search --query="trace_id:<TRACE_ID>" --from=30d --limit=1000 \
  | jq '[.data[] | select(.attributes.custom.error) | {
      span_id: .attributes.span_id,
      service: .attributes.service,
      operation: .attributes.operation_name,
      resource: .attributes.resource_name,
      duration_ms: ((.attributes.custom.duration // 0) / 1000000 | . * 100 | round / 100),
      error: .attributes.custom.error.message
    }]'
```

### 4. Query additional data

If additional data would help diagnose the issue (e.g. logs, rum, cicd), use the pup CLI.
