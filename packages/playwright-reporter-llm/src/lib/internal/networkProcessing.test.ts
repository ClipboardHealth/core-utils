import type { NetworkRequest } from "../types";
import { annotateRedirectChains, buildNetworkRequestFromEvent } from "./networkProcessing";
import type { MonotonicAnchor } from "./traceTiming";

const ANCHOR: MonotonicAnchor = { wallTimeMs: 1_767_225_600_000, monotonicTimeMs: 5000 };
const ATTEMPT_START_MS = 1_767_225_600_000;

function makeResourceSnapshot(snapshot: Record<string, unknown>): Record<string, unknown> {
  return { type: "resource-snapshot", snapshot };
}

describe(buildNetworkRequestFromEvent, () => {
  it("parses a valid resource-snapshot into a NetworkRequest", () => {
    const event = makeResourceSnapshot({
      _resourceType: "fetch",
      request: { method: "POST", url: "https://api.example.com/orders" },
      response: { status: 201 },
    });

    const result = buildNetworkRequestFromEvent(event, {}, undefined, 0);

    expect(result).toMatchObject({
      method: "POST",
      url: "https://api.example.com/orders",
      status: 201,
      resourceType: "fetch",
    });
  });

  it("returns undefined for non-resource-snapshot events", () => {
    expect(buildNetworkRequestFromEvent({ type: "console" }, {}, undefined, 0)).toBeUndefined();
  });

  it("returns undefined when required fields are missing", () => {
    const event = makeResourceSnapshot({
      request: { method: "GET", url: "https://api.example.com" },
      response: {},
    });

    expect(buildNetworkRequestFromEvent(event, {}, undefined, 0)).toBeUndefined();
  });

  it("extracts request and response bodies from archive entries", () => {
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

    const result = buildNetworkRequestFromEvent(event, archiveEntries, undefined, 0);

    expect(result?.requestBody).toBe('{"request":"hello"}');
    expect(result?.responseBody).toBe('{"response":"world"}');
  });

  it("caps request and response bodies at 2KB", () => {
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

    const result = buildNetworkRequestFromEvent(event, archiveEntries, undefined, 0);

    expect(result?.requestBody).toHaveLength(2048);
    expect(result?.responseBody).toHaveLength(2048);
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

    const result = buildNetworkRequestFromEvent(event, archiveEntries, undefined, 0);

    expect(result?.requestBody).toBeUndefined();
    expect(result?.responseBody).toBeUndefined();
  });

  it("extracts allowlisted headers and ignores non-allowlisted", () => {
    const event = makeResourceSnapshot({
      request: {
        method: "GET",
        url: "https://api.example.com/data",
        headers: [
          { name: "traceparent", value: "00-4bf92f3577b34da6a3ce929d0e0e4736-00f067aa0ba902b7-01" },
          { name: "x-ignore-me", value: "ignore" },
        ],
      },
      response: {
        status: 200,
        headers: [
          { name: "content-type", value: "application/json" },
          { name: "x-ignore-me", value: "ignore" },
        ],
      },
    });

    const result = buildNetworkRequestFromEvent(event, {}, undefined, 0);

    expect(result?.requestHeaders).toStrictEqual({
      traceparent: "00-4bf92f3577b34da6a3ce929d0e0e4736-00f067aa0ba902b7-01",
    });
    expect(result?.responseHeaders).toStrictEqual({ "content-type": "application/json" });
  });

  it("extracts timings and derives duration excluding ssl", () => {
    const event = makeResourceSnapshot({
      request: { method: "GET", url: "https://api.example.com/data" },
      response: { status: 200 },
      timings: { dns: 2, connect: 7, ssl: 4, send: 1, wait: 12, receive: 5 },
    });

    const result = buildNetworkRequestFromEvent(event, {}, undefined, 0);

    expect(result?.timings).toStrictEqual({
      dnsMs: 2,
      connectMs: 7,
      sslMs: 4,
      sendMs: 1,
      waitMs: 12,
      receiveMs: 5,
    });
    expect(result?.durationMs).toBe(27);
  });

  it("omits durationMs when negative timing values are present", () => {
    const event = makeResourceSnapshot({
      request: { method: "GET", url: "https://api.example.com/data" },
      response: { status: 200 },
      timings: { wait: -1, receive: -1 },
    });

    const result = buildNetworkRequestFromEvent(event, {}, undefined, 0);

    expect(result?.durationMs).toBeUndefined();
  });

  it("extracts traceId and spanId from traceparent, preferring response over request", () => {
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

    const result = buildNetworkRequestFromEvent(event, {}, undefined, 0);

    expect(result?.traceId).toBe("22222222222222222222222222222222");
    expect(result?.spanId).toBe("bbbbbbbbbbbbbbbb");
  });

  it("falls back to request traceparent when response lacks one", () => {
    const event = makeResourceSnapshot({
      request: {
        method: "GET",
        url: "https://api.example.com/data",
        headers: [
          { name: "traceparent", value: "00-11111111111111111111111111111111-aaaaaaaaaaaaaaaa-01" },
        ],
      },
      response: { status: 200 },
    });

    const result = buildNetworkRequestFromEvent(event, {}, undefined, 0);

    expect(result?.traceId).toBe("11111111111111111111111111111111");
    expect(result?.spanId).toBe("aaaaaaaaaaaaaaaa");
  });

  it("ignores malformed traceparent", () => {
    const event = makeResourceSnapshot({
      request: {
        method: "GET",
        url: "https://api.example.com/data",
        headers: [{ name: "traceparent", value: "not-a-valid-traceparent" }],
      },
      response: { status: 200 },
    });

    const result = buildNetworkRequestFromEvent(event, {}, undefined, 0);

    expect(result?.traceId).toBeUndefined();
    expect(result?.spanId).toBeUndefined();
  });

  it("ignores traceparent with invalid all-zero trace or span id", () => {
    const event = makeResourceSnapshot({
      request: {
        method: "GET",
        url: "https://api.example.com/data",
        headers: [
          { name: "traceparent", value: "00-00000000000000000000000000000000-aaaaaaaaaaaaaaaa-01" },
        ],
      },
      response: { status: 200 },
    });

    const result = buildNetworkRequestFromEvent(event, {}, undefined, 0);

    expect(result?.traceId).toBeUndefined();
    expect(result?.spanId).toBeUndefined();
  });

  it("ignores traceparent with invalid ff version", () => {
    const event = makeResourceSnapshot({
      request: {
        method: "GET",
        url: "https://api.example.com/data",
        headers: [
          { name: "traceparent", value: "ff-11111111111111111111111111111111-aaaaaaaaaaaaaaaa-01" },
        ],
      },
      response: { status: 200 },
    });

    const result = buildNetworkRequestFromEvent(event, {}, undefined, 0);

    expect(result?.traceId).toBeUndefined();
  });

  it("extracts failureText and wasAborted", () => {
    const event = makeResourceSnapshot({
      _wasAborted: true,
      request: { method: "GET", url: "https://api.example.com/flaky" },
      response: { status: -1, _failureText: "net::ERR_FAILED" },
    });

    const result = buildNetworkRequestFromEvent(event, {}, undefined, 0);

    expect(result?.failureText).toBe("net::ERR_FAILED");
    expect(result?.wasAborted).toBe(true);
  });

  it("extracts redirectToUrl", () => {
    const event = makeResourceSnapshot({
      request: { method: "GET", url: "https://app.example.com/start" },
      response: { status: 302, redirectURL: "https://app.example.com/final" },
    });

    const result = buildNetworkRequestFromEvent(event, {}, undefined, 0);

    expect(result?.redirectToUrl).toBe("https://app.example.com/final");
  });

  it("computes offsetMs from monotonicTime with anchor", () => {
    const event = makeResourceSnapshot({
      _monotonicTime: 5500,
      request: { method: "GET", url: "https://api.example.com/data" },
      response: { status: 200 },
    });

    const result = buildNetworkRequestFromEvent(event, {}, ANCHOR, ATTEMPT_START_MS);

    expect(result?.offsetMs).toBe(500);
  });

  it("falls back to startedDateTime for offsetMs", () => {
    const event = makeResourceSnapshot({
      startedDateTime: "2026-01-01T00:00:00.750Z",
      request: { method: "GET", url: "https://api.example.com/data" },
      response: { status: 200 },
    });
    const attemptStartMs = new Date("2026-01-01T00:00:00.000Z").getTime();

    const result = buildNetworkRequestFromEvent(event, {}, undefined, attemptStartMs);

    expect(result?.offsetMs).toBe(750);
  });

  it("returns undefined offsetMs when neither monotonicTime nor startedDateTime available", () => {
    const event = makeResourceSnapshot({
      request: { method: "GET", url: "https://api.example.com/data" },
      response: { status: 200 },
    });

    const result = buildNetworkRequestFromEvent(event, {}, undefined, 0);

    expect(result?.offsetMs).toBeUndefined();
  });
});

describe(annotateRedirectChains, () => {
  it("annotates redirect chain across requests", () => {
    const requests: NetworkRequest[] = [
      {
        method: "GET",
        url: "https://app.example.com/start",
        status: 302,
        redirectToUrl: "https://app.example.com/final",
      },
      { method: "GET", url: "https://app.example.com/final", status: 200 },
    ];

    annotateRedirectChains(requests);

    expect(requests[0]?.redirectChain).toStrictEqual([
      { url: "https://app.example.com/start", status: 302 },
      { url: "https://app.example.com/final", status: 200 },
    ]);
    expect(requests[1]?.redirectFromUrl).toBe("https://app.example.com/start");
  });

  it("does not annotate when no redirects", () => {
    const requests: NetworkRequest[] = [
      { method: "GET", url: "https://app.example.com/page", status: 200 },
    ];

    annotateRedirectChains(requests);

    expect(requests[0]?.redirectChain).toBeUndefined();
  });
});
