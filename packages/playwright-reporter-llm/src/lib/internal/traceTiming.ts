import { asNumber, asRecord, asString } from "./typeGuards";

export interface MonotonicAnchor {
  wallTimeMs: number;
  monotonicTimeMs: number;
}

export function monotonicToOffsetMs(
  monotonicTimeMs: number,
  anchor: MonotonicAnchor,
  attemptStartTimeMs: number,
): number {
  const wallTimeMs = anchor.wallTimeMs + (monotonicTimeMs - anchor.monotonicTimeMs);
  return Math.round(wallTimeMs) - attemptStartTimeMs;
}

export function extractMonotonicAnchor(traceContent: string): MonotonicAnchor | undefined {
  const firstNewlineIndex = traceContent.indexOf("\n");
  const firstLine = (
    firstNewlineIndex === -1 ? traceContent : traceContent.slice(0, firstNewlineIndex)
  ).trim();
  if (!firstLine) {
    return undefined;
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(firstLine);
  } catch {
    return undefined;
  }

  const record = asRecord(parsed);
  if (record?.["type"] !== "context-options") {
    return undefined;
  }

  const wallTimeMs = asNumber(record["wallTime"]);
  const monotonicTimeMs = asNumber(record["monotonicTime"]);
  if (wallTimeMs !== undefined && monotonicTimeMs !== undefined) {
    return { wallTimeMs, monotonicTimeMs };
  }

  return undefined;
}

export function computeNetworkOffsetMs(
  snapshotRecord: Record<string, unknown>,
  anchor: MonotonicAnchor | undefined,
  attemptStartTimeMs: number,
): number | undefined {
  const monotonicTimeMs = asNumber(snapshotRecord["_monotonicTime"]);
  if (monotonicTimeMs !== undefined && anchor) {
    return monotonicToOffsetMs(monotonicTimeMs, anchor, attemptStartTimeMs);
  }

  const startedDateTime = asString(snapshotRecord["startedDateTime"]);
  if (startedDateTime) {
    const parsedMs = new Date(startedDateTime).getTime();
    if (!Number.isNaN(parsedMs)) {
      return parsedMs - attemptStartTimeMs;
    }
  }

  return undefined;
}
