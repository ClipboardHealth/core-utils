# Datadog APM Traces

Correlate a Playwright network instance with backend spans in Datadog's **APM Spans index**. Use the per-request `attempts[].network.instances[].traceId`; do not use the test-level fixture annotation.

## Prerequisites

Phase 0 of the flaky-debug skill must already have proved that `pup` can read APM spans and that the exact CI artifact is accessible. Do not run `pup auth status`; call `pup traces search` directly because environment-variable authentication can work in sandboxes where `pup auth status` does not.

If a query fails with `401`, run `pup auth login` or provide `DD_API_KEY` and `DD_APP_KEY`. For `403`, obtain APM read access. Do not continue an investigation without this access.

## Which trace ID is authoritative?

Use these sources in order:

1. The response `traceparent`, exposed as `network.instances[].traceId`. It identifies the context the backend actually selected.
2. For an aborted or unreadable response, the request's `x-datadog-trace-id`. Reporter versions containing the Datadog fallback normalize its unsigned decimal value to a 32-character, zero-padded hexadecimal trace ID.
3. The request `traceparent` only when no Datadog request context exists.

Do **not** query the test-level `traceparent` annotation. The Playwright fixture sets a W3C header, but Datadog RUM also adds a different `x-datadog-*` context to first-party requests. The observed staging backend selects the Datadog context when the two conflict.

For reports produced by an older reporter, inspect the full Playwright trace's request headers. Convert `x-datadog-trace-id` as described below. If neither a response trace nor the Datadog request header is available, use the request-ID correlation path instead of claiming that the fixture ID represents the backend trace.

## Known-good query recipe

### 1. Set an exact time window

Derive the request time from the attempt's `startTime` plus the network instance's `offsetMs`. Use a narrow absolute RFC 3339 window around the request; this avoids false matches and is safer than relying on `pup`'s one-hour default.

```bash
pup traces search \
  --query='env:staging trace_id:<TRACE_ID>' \
  --from='2026-07-06T14:10:00Z' \
  --to='2026-07-06T14:20:00Z' \
  --limit=1000
```

Start without a service filter when ownership is uncertain. Once the service is known, add it to reduce noise.

### 2. Use the staging service name

Staging APM service names are `cbh-*` prefixed. For example:

```bash
pup traces search \
  --query='env:staging service:cbh-backend-main trace_id:<TRACE_ID>' \
  --from='<RFC3339_START>' \
  --to='<RFC3339_END>' \
  --limit=1000
```

`service:cbh-backend-main` works; `service:backend-main` returns nothing. Other examples include `cbh-user`, `cbh-bg-jobs`, and `cbh-documents-service-backend`.

### 3. Use a supported ID representation

`pup traces search` accepts either:

- the full 32-character hexadecimal trace ID returned by the spans API, or
- the unsigned decimal value of the lower 64 bits.

Do not convert the entire 128-bit value to decimal; the APM Spans search did not match that representation in the live verification.

Convert a 32-character W3C/Datadog hexadecimal ID to its lower-64 decimal form:

```bash
node -e '
const id = process.argv[1].replace(/^0x/, "");
if (!/^[0-9a-f]{32}$/i.test(id)) process.exit(1);
console.log(BigInt(`0x${id.slice(-16)}`).toString(10));
' '<TRACE_ID>'
```

Normalize an `x-datadog-trace-id` decimal value to the reporter's 32-character hexadecimal form:

```bash
node -e '
const value = BigInt(process.argv[1]);
if (value <= 0n || value > 0xffffffffffffffffn) process.exit(1);
console.log(value.toString(16).padStart(32, "0"));
' '<X_DATADOG_TRACE_ID>'
```

### 4. Query a span ID only as a secondary lookup

```bash
pup traces search \
  --query='env:staging span_id:<SPAN_ID>' \
  --from='<RFC3339_START>' \
  --to='<RFC3339_END>' \
  --limit=1
```

A response `traceparent` contains the backend span ID. A request fallback contains the upstream parent span ID, which may not itself be an indexed backend span; the trace ID remains authoritative.

### 5. Summarize relevant spans

Durations are nanoseconds. Divide by 1,000,000 for milliseconds.

```bash
pup traces search \
  --query='env:staging trace_id:<TRACE_ID>' \
  --from='<RFC3339_START>' \
  --to='<RFC3339_END>' \
  --limit=1000 \
  | jq '[.data[].attributes | {
      trace_id,
      span_id,
      parent_id,
      service,
      operation: .operation_name,
      resource: .resource_name,
      status,
      retained_by,
      duration_ms: ((.custom.duration // 0) / 1000000 | . * 100 | round / 100),
      error: .custom.error.message
    }]'
```

## Retention limitation and fallback correlation

`pup traces search` searches indexed spans, not every ingested span. An ingested trace is available in Live Search for only 15 minutes unless a retention mechanism indexes it. A zero-result indexed query after that window does **not** prove that propagation or ingestion failed.

If no indexed span exists:

1. Record the exact query, environment, service variants, ID representations, and absolute time window tried.
2. Search logs in the same window using the API Gateway/request ID, exact method/path, and service. The reporter may expose `requestId`; setup diagnostics may expose `apiGatewayRequestId`.
3. Correlate the response status/body and the owning service from the report. Do not lower confidence merely because a success trace was not selected for retention; lower it only when a necessary causal link remains unproved.
4. For a new occurrence, run the APM lookup within 15 minutes or add an explicit retention strategy for test traffic before relying on historical APM lookup.

Example log search shape:

```bash
pup logs search \
  --query='env:staging "<API_GATEWAY_REQUEST_ID>"' \
  --from='<RFC3339_START>' \
  --to='<RFC3339_END>' \
  --limit=100
```

## Audit proof: why the fixture ID cannot be the bridge

The STAFF-1792 audit used the failed attempt from `cbh-admin-frontend` CI run `29337068333` (`2026-07-14T13:35:30Z`) and its raw Playwright trace:

- The request carried fixture W3C context `00-0df9d80ac12e173dfcfc55aa29379ba6-5819a315ecd12173-01`.
- Datadog RUM added `x-datadog-trace-id: 13639781014258445719`, `x-datadog-parent-id: 7268017665183408395`, origin `rum`, and sampling priority `1`.
- The backend response carried `00-0000000000000000bd4a3c90d8fded97-277d492d139029e1-01`. `bd4a3c90d8fded97` is exactly the hexadecimal form of the request's decimal `x-datadog-trace-id`, not the fixture trace ID.

This proves header propagation reached the backend, but the backend selected the Datadog RUM context. Minting a differently shaped W3C fixture ID cannot fix that conflict by itself. The reporter therefore uses the response trace and, when the response is unreadable, the Datadog request context.

The same audit checked backend and Datadog configuration:

- `clipboard-health/src/tracer.ts` calls `tracer.init({ logLevel: "error" })` without a propagation-style override; the locked `dd-trace` version is `5.27.1`.
- No customer APM head-sampling rules were returned for `cbh-backend-main`/staging, and adaptive sampling was not onboarded.
- The retention-filter API returned `401` for the available OAuth session, so the audit could not enumerate organization retention filters and does not infer that none exist. Indexed sample spans reported `retained_by: diversity_sampling`.

Historical indexed proof comes from STAFF-1678. Its backend response trace ID `00000000000000001732fff1044f982e` converts to decimal `1671679822332401710`; this exact query returned retained `cbh-user` spans for `POST /api/user/create`:

```bash
pup traces search \
  --query='trace_id:1671679822332401710 env:staging service:cbh-user resource_name:"POST /api/user/create"' \
  --from='2026-07-06T14:10:00Z' \
  --to='2026-07-06T14:20:00Z' \
  --limit=5
```

Those spans reported `retained_by: diversity_sampling`. This is the working alternative correlation path: use the backend-selected per-request trace ID when it was retained; otherwise correlate by API Gateway/request ID plus exact time, method, path, and service.
