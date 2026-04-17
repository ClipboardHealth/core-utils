import { describe, expect, it } from "vitest";
import { computeNetworkOffsetMs, extractMonotonicAnchor, monotonicToOffsetMs } from "./traceTiming";

describe(monotonicToOffsetMs, () => {
  it("converts monotonic time to offset relative to attempt start", () => {
    const anchor = { wallTimeMs: 1_000_000, monotonicTimeMs: 5000 };

    const result = monotonicToOffsetMs(5500, anchor, 1_000_000);

    expect(result).toBe(500);
  });
});

describe(extractMonotonicAnchor, () => {
  it("extracts anchor from context-options first line", () => {
    const traceContent = JSON.stringify({
      type: "context-options",
      wallTime: 1_000_000,
      monotonicTime: 5000,
    });

    const anchor = extractMonotonicAnchor(traceContent);

    expect(anchor).toStrictEqual({ wallTimeMs: 1_000_000, monotonicTimeMs: 5000 });
  });

  it("returns undefined for non-context-options first line", () => {
    const traceContent = JSON.stringify({ type: "event", method: "pageError" });

    expect(extractMonotonicAnchor(traceContent)).toBeUndefined();
  });

  it("returns undefined for malformed JSON", () => {
    expect(extractMonotonicAnchor("not-json")).toBeUndefined();
  });

  it("returns undefined for empty content", () => {
    expect(extractMonotonicAnchor("")).toBeUndefined();
  });

  it("handles multiline content and only reads first line", () => {
    const traceContent = `${JSON.stringify({ type: "context-options", wallTime: 100, monotonicTime: 50 })}\n${JSON.stringify({ type: "event" })}`;

    const anchor = extractMonotonicAnchor(traceContent);

    expect(anchor).toStrictEqual({ wallTimeMs: 100, monotonicTimeMs: 50 });
  });
});

describe(computeNetworkOffsetMs, () => {
  it("uses monotonicTime when anchor is available", () => {
    const anchor = { wallTimeMs: 1_000_000, monotonicTimeMs: 5000 };

    const result = computeNetworkOffsetMs({ _monotonicTime: 5200 }, anchor, 1_000_000);

    expect(result).toBe(200);
  });

  it("falls back to startedDateTime when no monotonicTime", () => {
    const result = computeNetworkOffsetMs(
      { startedDateTime: "2026-01-01T00:00:00.750Z" },
      undefined,
      new Date("2026-01-01T00:00:00.000Z").getTime(),
    );

    expect(result).toBe(750);
  });

  it("returns undefined when neither monotonicTime nor startedDateTime is available", () => {
    const result = computeNetworkOffsetMs({}, undefined, 0);

    expect(result).toBeUndefined();
  });
});
