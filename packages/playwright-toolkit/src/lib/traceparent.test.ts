import { createTraceparent, createTraceparentFixtures, installTraceparentForTest } from "../index";

describe("traceparent", () => {
  it("creates a valid non-zero W3C traceparent", () => {
    const mockRandomBytes = vi
      .fn<(byteCount: number) => Uint8Array>()
      .mockReturnValueOnce(Buffer.from("11111111111111111111111111111111", "hex"))
      .mockReturnValueOnce(Buffer.from("2222222222222222", "hex"));

    const actual = createTraceparent({
      randomBytesImplementation: mockRandomBytes,
    });

    expect(actual).toBe("00-11111111111111111111111111111111-2222222222222222-01");
  });

  it("installs the per-test header and annotation", async () => {
    const mockSetExtraHttpHeaders = vi
      .fn<(headers: Record<string, string>) => Promise<void>>()
      .mockResolvedValue();
    const annotations: Array<{ type: string; description?: string }> = [];

    const actual = await installTraceparentForTest({
      context: {
        setExtraHTTPHeaders: mockSetExtraHttpHeaders,
      },
      testInfo: { annotations },
      traceparent: "00-11111111111111111111111111111111-2222222222222222-01",
    });

    expect(actual).toEqual({
      traceparent: "00-11111111111111111111111111111111-2222222222222222-01",
    });
    expect(mockSetExtraHttpHeaders).toHaveBeenCalledWith({
      traceparent: actual.traceparent,
    });
    expect(annotations).toEqual([{ type: "traceparent", description: actual.traceparent }]);
  });

  it("preserves project HTTP headers in the automatic Playwright fixture", async () => {
    const mockSetExtraHttpHeaders = vi
      .fn<(headers: Record<string, string>) => Promise<void>>()
      .mockResolvedValue();
    const mockUse = vi.fn<(traceparent: string) => Promise<void>>().mockResolvedValue();
    const actual = createTraceparentFixtures({
      randomBytesImplementation: vi
        .fn<(byteCount: number) => Uint8Array>()
        .mockReturnValueOnce(Buffer.from("11111111111111111111111111111111", "hex"))
        .mockReturnValueOnce(Buffer.from("2222222222222222", "hex")),
    });
    const [fixture] = actual.traceparent as unknown as [
      (
        fixtureArguments: {
          context: { setExtraHTTPHeaders: typeof mockSetExtraHttpHeaders };
          extraHTTPHeaders: Record<string, string>;
        },
        use: typeof mockUse,
        testInfo: {
          annotations: Array<{ type: string; description?: string }>;
        },
      ) => Promise<void>,
      { auto: true },
    ];

    await fixture(
      {
        context: { setExtraHTTPHeaders: mockSetExtraHttpHeaders },
        extraHTTPHeaders: { "x-suite-header": "configured" },
      },
      mockUse,
      { annotations: [] },
    );

    expect(actual).toMatchObject({
      traceparent: [expect.any(Function), { auto: true }],
    });
    expect(mockSetExtraHttpHeaders).toHaveBeenCalledWith({
      "x-suite-header": "configured",
      traceparent: "00-11111111111111111111111111111111-2222222222222222-01",
    });
  });
});
