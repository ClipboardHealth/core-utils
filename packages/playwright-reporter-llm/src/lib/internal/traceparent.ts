const INVALID_TRACE_ID = "00000000000000000000000000000000";
const INVALID_SPAN_ID = "0000000000000000";
const TRACEPARENT_PATTERN = /^([0-9a-f]{2})-([0-9a-f]{32})-([0-9a-f]{16})-([0-9a-f]{2})$/;

export function parseTraceparent(header?: string): { traceId: string; spanId: string } | undefined {
  if (!header) {
    return undefined;
  }
  const match = TRACEPARENT_PATTERN.exec(header.trim().toLowerCase());
  if (!match) {
    return undefined;
  }
  const [, version, traceId, spanId] = match;
  if (version === "ff" || traceId === INVALID_TRACE_ID || spanId === INVALID_SPAN_ID) {
    return undefined;
  }
  return { traceId: traceId!, spanId: spanId! };
}
