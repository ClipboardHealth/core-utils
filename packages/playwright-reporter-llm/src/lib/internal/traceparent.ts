const INVALID_TRACE_ID = "00000000000000000000000000000000";
const INVALID_SPAN_ID = "0000000000000000";
const TRACEPARENT_PATTERN =
  /^(?<version>[0-9a-f]{2})-(?<traceId>[0-9a-f]{32})-(?<spanId>[0-9a-f]{16})-(?<flags>[0-9a-f]{2})$/;

export function parseTraceparent(header?: string): { traceId: string; spanId: string } | undefined {
  if (!header) {
    return undefined;
  }
  const match = TRACEPARENT_PATTERN.exec(header.trim().toLowerCase());
  if (!match) {
    return undefined;
  }
  const { version, traceId, spanId } = match.groups!;
  if (version === "ff" || traceId === INVALID_TRACE_ID || spanId === INVALID_SPAN_ID) {
    return undefined;
  }
  return { traceId: traceId!, spanId: spanId! };
}
