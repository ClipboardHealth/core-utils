import { verifyDeployedAssets, waitForDeployedAssets } from "../index";

describe("deployed asset verification", () => {
  it("retries transient responses and returns attempt diagnostics", async () => {
    const sleepDurations: number[] = [];
    const mockFetch = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(
        new Response(undefined, {
          status: 503,
          headers: { "content-type": "application/javascript" },
        }),
      )
      .mockResolvedValueOnce(
        new Response(undefined, {
          status: 200,
          headers: { "content-type": "application/javascript" },
        }),
      );

    const actual = await verifyDeployedAssets({
      checks: [
        {
          expectedContentTypes: ["application/javascript"],
          method: "HEAD",
          path: "assets/app.js",
          url: "https://example.test/assets/app.js",
        },
      ],
      fetchImplementation: mockFetch,
      retry: {
        maxAttempts: 3,
        delayMs: 50,
      },
      sleepImplementation: async ({ durationMs }) => {
        sleepDurations.push(durationMs);
      },
    });

    expect(actual.summary).toEqual({ failureCount: 0, passedCount: 1, totalCount: 1 });
    expect(actual.results[0]?.attempts).toHaveLength(2);
    expect(sleepDurations).toEqual([50]);
  });

  it("does not retry deterministic content-type mismatches", async () => {
    const mockFetch = vi.fn<typeof fetch>(
      async () =>
        new Response("not javascript", {
          status: 200,
          headers: { "content-type": "text/html" },
        }),
    );

    const actual = await verifyDeployedAssets({
      checks: [
        {
          expectedContentTypes: ["application/javascript"],
          method: "GET",
          path: "assets/app.js",
          url: "https://example.test/assets/app.js",
        },
      ],
      fetchImplementation: mockFetch,
    });

    expect(actual.summary.failureCount).toBe(1);
    expect(actual.results[0]?.errorMessage).toContain("expected content-type");
    expect(mockFetch).toHaveBeenCalledTimes(1);
  });

  it("does not retry deterministic fetch configuration errors", async () => {
    const mockFetch = vi.fn<typeof fetch>().mockRejectedValue(new TypeError("Invalid URL"));

    const actual = await verifyDeployedAssets({
      checks: [
        {
          path: "assets/app.js",
          url: "not-a-url",
        },
      ],
      fetchImplementation: mockFetch,
      retry: { maxAttempts: 3 },
    });

    expect(actual.summary.failureCount).toBe(1);
    expect(actual.results[0]?.errorMessage).toContain("Invalid URL");
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it("requires a healthy stable window when polling a deployment", async () => {
    let currentTimeMs = 0;
    const mockFetch = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(new Response(undefined, { status: 200 }))
      .mockResolvedValueOnce(new Response(undefined, { status: 503 }))
      .mockResolvedValue(new Response(undefined, { status: 200 }));

    const actual = await waitForDeployedAssets({
      checks: [{ path: "index.html", url: "https://example.test/index.html" }],
      fetchImplementation: mockFetch,
      nowImplementation: () => currentTimeMs,
      pollIntervalMs: 100,
      retry: { maxAttempts: 1 },
      stableWindowMs: 200,
      timeoutMs: 1000,
      sleepImplementation: async ({ durationMs }) => {
        currentTimeMs += durationMs;
      },
    });

    expect(actual.summary.failureCount).toBe(0);
    expect(actual.wait).toMatchObject({
      isStableWindowSatisfied: true,
      attempts: 5,
    });
  });

  it("supports cache-busted runtime checks with custom body validation", async () => {
    const requestedUrls: string[] = [];

    const actual = await verifyDeployedAssets({
      checks: [
        {
          cacheMode: "cache-busted",
          method: "GET",
          path: "build-info.json",
          url: "https://example.test/build-info.json",
          validateResponse: async ({ response }) => {
            const responseText = await response.text();

            return {
              isValid: responseText === JSON.stringify({ commitHash: "expected-commit" }),
              message: "commit mismatch",
            };
          },
        },
      ],
      fetchImplementation: vi.fn<typeof fetch>(async (url) => {
        requestedUrls.push(formatFetchInput(url));
        return new Response(JSON.stringify({ commitHash: "expected-commit" }), {
          status: 200,
          headers: { "content-type": "application/json" },
        });
      }),
    });

    expect(actual.summary.failureCount).toBe(0);
    expect(requestedUrls[0]).toContain("cbhAssetVerifier=");
  });

  it("omits request headers and validator functions from reports", async () => {
    const actual = await verifyDeployedAssets({
      checks: [
        {
          headers: { authorization: "Bearer secret-token" },
          path: "private.json",
          url: "https://example.test/private.json",
          validateResponse: () => ({ isValid: true }),
        },
      ],
      fetchImplementation: vi.fn<typeof fetch>(async () => new Response("{}", { status: 200 })),
    });

    expect(actual.results[0]?.check).not.toHaveProperty("headers");
    expect(actual.results[0]?.check).not.toHaveProperty("validateResponse");
  });

  it("records and retries transient validator exceptions", async () => {
    const mockValidator = vi
      .fn<
        NonNullable<
          Parameters<typeof verifyDeployedAssets>[0]["checks"][number]["validateResponse"]
        >
      >()
      .mockRejectedValueOnce(new TypeError("fetch failed"))
      .mockResolvedValueOnce({ isValid: true });

    const actual = await verifyDeployedAssets({
      checks: [
        {
          path: "build-info.json",
          url: "https://example.test/build-info.json",
          validateResponse: mockValidator,
        },
      ],
      fetchImplementation: vi.fn<typeof fetch>(async () => new Response("{}", { status: 200 })),
      retry: { maxAttempts: 2, delayMs: 0 },
    });

    expect(actual.summary.failureCount).toBe(0);
    expect(actual.results[0]?.attempts).toHaveLength(2);
    expect(actual.results[0]?.attempts[0]?.errorMessage).toBe("fetch failed");
  });

  it.each([
    ["text/javascript", "application/javascript"],
    ["application/javascript", "text/javascript"],
    ["application/manifest+json", "application/json"],
    ["application/json", "application/manifest+json"],
    ["image/vnd.microsoft.icon", "image/x-icon"],
    ["image/x-icon", "image/vnd.microsoft.icon"],
  ])("treats expected %s as equivalent to actual %s", async (expected, actualContentType) => {
    const actual = await verifyDeployedAssets({
      checks: [
        {
          expectedContentTypes: [expected],
          path: "asset",
          url: "https://example.test/asset",
        },
      ],
      fetchImplementation: vi.fn<typeof fetch>(
        async () =>
          new Response(undefined, {
            status: 200,
            headers: { "content-type": actualContentType },
          }),
      ),
    });

    expect(actual.summary.failureCount).toBe(0);
  });
});

function formatFetchInput(input: string | URL | Request): string {
  if (typeof input === "string") {
    return input;
  }

  return input instanceof URL ? input.toString() : input.url;
}
