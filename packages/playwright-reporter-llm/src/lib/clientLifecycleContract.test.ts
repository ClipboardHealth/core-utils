import {
  BROWSER_LIFECYCLE_ATTACHMENT_SCHEMA,
  type BrowserLifecycleRecord,
  encodeBrowserLifecycleAttachment,
  parseBrowserLifecycleAttachment,
} from "../index";
import {
  createBrowserLifecycle48RecordFixture,
  createBrowserLifecycleCompletedFixture,
  createBrowserLifecycleRequest43Fixture,
} from "./internal/testHelpers";

describe("browser lifecycle attachment contract", () => {
  it("round trips an HTTP response status when present", () => {
    const input = {
      ...createBrowserLifecycleCompletedFixture({ requestNumber: 1 }),
      httpStatus: 503,
    };

    const encoded = encodeBrowserLifecycleAttachment({ records: [input] });
    const actual = parseBrowserLifecycleAttachment({ content: encoded.body });

    expect(actual?.records[0]).toMatchObject({ httpStatus: 503 });
  });

  it("keeps the HTTP response status absent when omitted", () => {
    const input = createBrowserLifecycleCompletedFixture({ requestNumber: 1 });

    const encoded = encodeBrowserLifecycleAttachment({ records: [input] });
    const actual = parseBrowserLifecycleAttachment({ content: encoded.body });

    expect(encoded.attachment.records[0]).not.toHaveProperty("httpStatus");
    expect(actual?.records[0]).not.toHaveProperty("httpStatus");
  });

  it("round trips the 48-record failing shape within the shared byte cap", () => {
    const input = createBrowserLifecycle48RecordFixture();

    const encoded = encodeBrowserLifecycleAttachment({ records: input });
    const parsed = parseBrowserLifecycleAttachment({ content: encoded.body });

    expect(encoded.body.byteLength).toBeLessThanOrEqual(
      BROWSER_LIFECYCLE_ATTACHMENT_SCHEMA.maximumBytes,
    );
    expect(parsed).toBeDefined();
    expect(parsed?.records).toHaveLength(48);
    expect(parsed?.records.find((record) => record.playwrightRequestKey === "request-43")).toEqual(
      createBrowserLifecycleRequest43Fixture(),
    );
    expect(parsed?.truncated).toBe(false);
  });

  it("prioritizes anomalies when valid records exceed the shared byte cap", () => {
    const longIdentifier = "a".repeat(256);
    const longPathTemplate = `/${"a".repeat(511)}`;
    const completedRecords = Array.from({ length: 100 }, (_, index): BrowserLifecycleRecord => ({
      ...createBrowserLifecycleCompletedFixture({ requestNumber: index + 1 }),
      pathTemplate: longPathTemplate,
      playwrightRequestKey: `request-${index + 1}-${longIdentifier}`,
      cdpRequestId: longIdentifier,
      loaderId: longIdentifier,
      apiGatewayRequestId: longIdentifier,
    }));
    const input = [...completedRecords, createBrowserLifecycleRequest43Fixture()];

    const actual = encodeBrowserLifecycleAttachment({ records: input });
    const parsed = parseBrowserLifecycleAttachment({ content: actual.body });

    expect(actual.body.byteLength).toBeLessThanOrEqual(
      BROWSER_LIFECYCLE_ATTACHMENT_SCHEMA.maximumBytes,
    );
    expect(actual.droppedRecordCount).toBeGreaterThan(0);
    expect(parsed?.truncated).toBe(true);
    expect(parsed?.records[0]?.playwrightRequestKey).toBe("request-43");
    expect(parsed?.records.some((record) => record.playwrightRequestKey === "request-43")).toBe(
      true,
    );
  });

  it("rejects a flat lifecycle record labeled with the nested schema version", () => {
    const input = Buffer.from(
      JSON.stringify({
        schemaVersion: BROWSER_LIFECYCLE_ATTACHMENT_SCHEMA.version,
        truncated: false,
        records: [
          {
            method: "GET",
            origin: "https://api.example.com",
            pathTemplate: "/v1/orders/:id",
            requestStartedAt: "2026-07-28T16:08:52.453Z",
            requestStartedMonotonicMs: 13_041.814_252,
            classification: "no_response_headers",
          },
        ],
      }),
    );

    const actual = parseBrowserLifecycleAttachment({ content: input });

    expect(actual).toBeUndefined();
  });

  it("retains valid records when another record is malformed", () => {
    const validRecord = createBrowserLifecycleCompletedFixture({ requestNumber: 1 });
    const input = Buffer.from(
      JSON.stringify({
        schemaVersion: BROWSER_LIFECYCLE_ATTACHMENT_SCHEMA.version,
        truncated: false,
        records: [validRecord, { classification: "completed" }],
      }),
    );

    const actual = parseBrowserLifecycleAttachment({ content: input });

    expect(actual).toEqual({
      schemaVersion: BROWSER_LIFECYCLE_ATTACHMENT_SCHEMA.version,
      truncated: true,
      records: [validRecord],
    });
  });

  it.each([
    Buffer.from("{"),
    Buffer.from(JSON.stringify({ schemaVersion: 2, records: [] })),
    Buffer.from(JSON.stringify({ schemaVersion: 1, truncated: false, records: [] })),
    Buffer.from(
      JSON.stringify({
        schemaVersion: 2,
        truncated: false,
        records: [{ classification: "completed" }],
      }),
    ),
  ])("rejects malformed attachment content", (input) => {
    const actual = parseBrowserLifecycleAttachment({ content: input });

    expect(actual).toBeUndefined();
  });

  it("emits only sanitized allowlisted fields", () => {
    const input: BrowserLifecycleRecord & {
      authorization: string;
      headers: { cookie: string };
    } = {
      method: " get ",
      origin: "https://user:password@api.example.com",
      pathTemplate: "/v1/orders/:id?token=secret",
      requestStarted: {
        cdp: { utc: "invalid", monotonicMilliseconds: -1 },
        playwright: {
          utc: "2026-07-28T16:08:52.455Z",
          monotonicMilliseconds: 13_043.575_483,
        },
      },
      loadingFailed: {
        errorText: "\u001B[31mnet::ERR_CONNECTION_RESET\u001B[0m",
        canceled: false,
        blockedReason: "other",
        corsErrorStatus: "InvalidResponse",
      },
      playwrightRequestKey: "a".repeat(256),
      cdpRequestId: "unsafe request id",
      loaderId: "a".repeat(257),
      traceId: "0123456789ABCDEF0123456789ABCDEF",
      spanId: "0123456789ABCDEF",
      apiGatewayRequestId: "gateway-request-id=",
      protocol: "h2\rsecret",
      connection: {
        id: -1,
        reused: false,
        remoteEndpoint: { ipAddress: "host.example.com", port: 443 },
      },
      encodedBytes: {
        data: 0,
        responseHeaders: -1,
        total: Number.MAX_SAFE_INTEGER,
      },
      classification: "network_failure",
      authorization: "Bearer secret",
      headers: { cookie: "session=secret" },
    };

    const encoded = encodeBrowserLifecycleAttachment({ records: [input] });
    const actual = parseBrowserLifecycleAttachment({ content: encoded.body });

    expect(actual?.records[0]).toEqual({
      method: "GET",
      origin: "https://api.example.com",
      pathTemplate: "/v1/orders/:id",
      requestStarted: {
        playwright: {
          utc: "2026-07-28T16:08:52.455Z",
          monotonicMilliseconds: 13_043.575_483,
        },
      },
      loadingFailed: {
        errorText: "net::ERR_CONNECTION_RESET",
        canceled: false,
        blockedReason: "other",
        corsErrorStatus: "InvalidResponse",
      },
      playwrightRequestKey: "a".repeat(256),
      traceId: "0123456789abcdef0123456789abcdef",
      spanId: "0123456789abcdef",
      apiGatewayRequestId: "gateway-request-id=",
      connection: {
        reused: false,
        remoteEndpoint: { port: 443 },
      },
      encodedBytes: {
        data: 0,
        total: Number.MAX_SAFE_INTEGER,
      },
      classification: "network_failure",
    });
    expect(JSON.stringify(actual)).not.toContain("secret");
    expect(JSON.stringify(actual)).not.toContain("authorization");
    expect(JSON.stringify(actual)).not.toContain("cookie");
  });
});
