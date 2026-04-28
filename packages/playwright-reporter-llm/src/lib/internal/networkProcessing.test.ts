import { buildNetworkObservationFromEvent, inferResourceType } from "./networkProcessing";
import type { MonotonicAnchor } from "./traceTiming";

const ANCHOR: MonotonicAnchor = { wallTimeMs: 1_767_225_600_000, monotonicTimeMs: 5000 };
const ATTEMPT_START_MS = 1_767_225_600_000;

function makeResourceSnapshot(snapshot: Record<string, unknown>): Record<string, unknown> {
  return { type: "resource-snapshot", snapshot };
}

function buildObservation(
  event: Record<string, unknown>,
  options: {
    archiveEntries?: Record<string, Uint8Array>;
    anchor?: MonotonicAnchor;
    attemptStartTimeMs?: number;
  } = {},
) {
  return buildNetworkObservationFromEvent({
    eventRecord: event,
    archiveEntries: options.archiveEntries ?? {},
    anchor: options.anchor,
    attemptStartTimeMs: options.attemptStartTimeMs ?? 0,
  });
}

describe(buildNetworkObservationFromEvent, () => {
  it("parses a valid resource-snapshot into a NetworkObservation", () => {
    const event = makeResourceSnapshot({
      _resourceType: "fetch",
      request: { method: "POST", url: "https://api.example.com/orders" },
      response: { status: 201 },
    });

    const result = buildObservation(event);

    expect(result?.shape).toMatchObject({
      method: "POST",
      url: "https://api.example.com/orders",
      status: 201,
      resourceType: "fetch",
    });
  });

  it("returns undefined for non-resource-snapshot events", () => {
    expect(buildObservation({ type: "console" })).toBeUndefined();
  });

  it("returns undefined when required fields are missing", () => {
    const event = makeResourceSnapshot({
      request: { method: "GET", url: "https://api.example.com" },
      response: {},
    });

    expect(buildObservation(event)).toBeUndefined();
  });

  it("extracts request and response bodies and fingerprints them", () => {
    const archiveEntries: Record<string, Uint8Array> = {
      "resources/req-sha": new Uint8Array(Buffer.from('{"request":"hello"}')),
      "resources/res-sha": new Uint8Array(Buffer.from('{"response":"world"}')),
    };
    const event = makeResourceSnapshot({
      request: {
        method: "POST",
        url: "https://api.example.com/data",
        postData: { mimeType: "application/json", _sha1: "req-sha" },
      },
      response: {
        status: 200,
        content: { mimeType: "application/json", _sha1: "res-sha" },
      },
    });

    const result = buildObservation(event, { archiveEntries });

    expect(result?.requestBody?.content).toBe('{"request":"hello"}');
    expect(result?.requestBody?.truncated).toBe(false);
    expect(result?.requestBody?.fingerprint).toMatch(/^[0-9a-f]{40}$/);
    expect(result?.responseBody?.content).toBe('{"response":"world"}');
  });

  it("caps request and response bodies at 2KB and marks truncated", () => {
    const largeBody = "x".repeat(5000);
    const archiveEntries: Record<string, Uint8Array> = {
      "resources/sha1": new Uint8Array(Buffer.from(largeBody)),
    };
    const event = makeResourceSnapshot({
      request: {
        method: "POST",
        url: "https://api.example.com/data",
        postData: { mimeType: "application/json", _sha1: "sha1" },
      },
      response: {
        status: 200,
        content: { mimeType: "text/plain", _sha1: "sha1" },
      },
    });

    const result = buildObservation(event, { archiveEntries });

    expect(result?.requestBody?.content).toHaveLength(2048);
    expect(result?.requestBody?.truncated).toBe(true);
    expect(result?.responseBody?.content).toHaveLength(2048);
    expect(result?.responseBody?.truncated).toBe(true);
  });

  it("skips binary content types for bodies", () => {
    const archiveEntries: Record<string, Uint8Array> = {
      "resources/sha1": new Uint8Array(Buffer.from("binary")),
    };
    const event = makeResourceSnapshot({
      request: {
        method: "POST",
        url: "https://api.example.com/data",
        postData: { mimeType: "application/octet-stream", _sha1: "sha1" },
      },
      response: { status: 200, content: { mimeType: "image/png", _sha1: "sha1" } },
    });

    const result = buildObservation(event, { archiveEntries });

    expect(result?.requestBody).toBeUndefined();
    expect(result?.responseBody).toBeUndefined();
  });

  it("extracts request/correlation ids from allowlisted headers", () => {
    const event = makeResourceSnapshot({
      request: {
        method: "GET",
        url: "https://api.example.com/data",
        headers: [
          { name: "x-request-id", value: "req-abc-123" },
          { name: "x-correlation-id", value: "corr-xyz-456" },
        ],
      },
      response: { status: 200 },
    });

    const result = buildObservation(event);

    expect(result?.instance.requestId).toBe("req-abc-123");
    expect(result?.instance.correlationId).toBe("corr-xyz-456");
  });

  it("extracts timings and derives duration excluding ssl", () => {
    const event = makeResourceSnapshot({
      request: { method: "GET", url: "https://api.example.com/data" },
      response: { status: 200 },
      timings: { dns: 2, connect: 7, ssl: 4, send: 1, wait: 12, receive: 5 },
    });

    const result = buildObservation(event);

    expect(result?.instance.timings).toStrictEqual({
      dnsMs: 2,
      connectMs: 7,
      sslMs: 4,
      sendMs: 1,
      waitMs: 12,
      receiveMs: 5,
    });
    expect(result?.instance.durationMs).toBe(27);
  });

  it("omits durationMs when negative timing values are present", () => {
    const event = makeResourceSnapshot({
      request: { method: "GET", url: "https://api.example.com/data" },
      response: { status: 200 },
      timings: { wait: -1, receive: -1 },
    });

    const result = buildObservation(event);

    expect(result?.instance.durationMs).toBeUndefined();
  });

  it("extracts traceId/spanId from traceparent preferring response over request", () => {
    const event = makeResourceSnapshot({
      request: {
        method: "GET",
        url: "https://api.example.com/data",
        headers: [
          { name: "traceparent", value: "00-11111111111111111111111111111111-aaaaaaaaaaaaaaaa-01" },
        ],
      },
      response: {
        status: 200,
        headers: [
          { name: "traceparent", value: "00-22222222222222222222222222222222-bbbbbbbbbbbbbbbb-01" },
        ],
      },
    });

    const result = buildObservation(event);

    expect(result?.instance.traceId).toBe("22222222222222222222222222222222");
    expect(result?.instance.spanId).toBe("bbbbbbbbbbbbbbbb");
  });

  it("extracts failureText and wasAborted onto shape", () => {
    const event = makeResourceSnapshot({
      _wasAborted: true,
      request: { method: "GET", url: "https://api.example.com/flaky" },
      response: { status: -1, _failureText: "net::ERR_FAILED" },
    });

    const result = buildObservation(event);

    expect(result?.shape.failureText).toBe("net::ERR_FAILED");
    expect(result?.shape.wasAborted).toBe(true);
  });

  it("extracts redirectToUrl onto instance", () => {
    const event = makeResourceSnapshot({
      request: { method: "GET", url: "https://app.example.com/start" },
      response: { status: 302, redirectURL: "https://app.example.com/final" },
    });

    const result = buildObservation(event);

    expect(result?.instance.redirectToUrl).toBe("https://app.example.com/final");
  });

  it("computes offsetMs from monotonicTime with anchor", () => {
    const event = makeResourceSnapshot({
      _monotonicTime: 5500,
      request: { method: "GET", url: "https://api.example.com/data" },
      response: { status: 200 },
    });

    const result = buildObservation(event, {
      anchor: ANCHOR,
      attemptStartTimeMs: ATTEMPT_START_MS,
    });

    expect(result?.instance.offsetMs).toBe(500);
  });
});

describe(inferResourceType, () => {
  it("returns declared resource type when present", () => {
    expect(inferResourceType({ declaredResourceType: "fetch", url: "https://x.com/a" })).toBe(
      "fetch",
    );
  });

  it("infers from content-type", () => {
    expect(inferResourceType({ url: "https://x.com/a", responseContentType: "image/png" })).toBe(
      "image",
    );
    expect(inferResourceType({ url: "https://x.com/a", responseContentType: "text/css" })).toBe(
      "stylesheet",
    );
    expect(
      inferResourceType({ url: "https://x.com/a", responseContentType: "text/javascript" }),
    ).toBe("script");
    expect(
      inferResourceType({ url: "https://x.com/a", responseContentType: "application/javascript" }),
    ).toBe("script");
    expect(inferResourceType({ url: "https://x.com/a", responseContentType: "font/woff2" })).toBe(
      "font",
    );
    expect(inferResourceType({ url: "https://x.com/a", responseContentType: "video/mp4" })).toBe(
      "media",
    );
    expect(inferResourceType({ url: "https://x.com/a", responseContentType: "text/html" })).toBe(
      "document",
    );
  });

  it("falls back to URL extension", () => {
    expect(inferResourceType({ url: "https://cdn.x.com/main.js" })).toBe("script");
    expect(inferResourceType({ url: "https://cdn.x.com/main.css" })).toBe("stylesheet");
    expect(inferResourceType({ url: "https://cdn.x.com/logo.png?v=1" })).toBe("image");
    expect(inferResourceType({ url: "https://cdn.x.com/font.woff2" })).toBe("font");
    expect(inferResourceType({ url: "https://cdn.x.com/clip.mp4" })).toBe("media");
  });

  it("returns undefined when nothing matches", () => {
    expect(inferResourceType({ url: "https://x.com/api/thing" })).toBeUndefined();
  });
});
