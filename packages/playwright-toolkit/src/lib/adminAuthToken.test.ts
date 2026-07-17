import { mkdtemp, readdir, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import {
  type AdminAuthTokenCommandRunner,
  generateAdminAuthToken,
  getOrCreateAdminAuthToken,
  invalidateAdminAuthToken,
} from "../index";

describe("getOrCreateAdminAuthToken", () => {
  let cacheDirectory: string;

  beforeEach(async () => {
    cacheDirectory = await mkdtemp(path.join(tmpdir(), "playwright-toolkit-token-"));
  });

  afterEach(async () => {
    await rm(cacheDirectory, { force: true, recursive: true });
  });

  it("serializes concurrent token generation through the shared lock", async () => {
    let resolveToken: ((value: string) => void) | undefined;
    const tokenPromise = new Promise<string>((resolve) => {
      resolveToken = resolve;
    });
    const mockCreateToken = vi.fn<() => Promise<string>>(async () => await tokenPromise);
    const input = {
      adminEmail: "e2e@clipboardhealth.com",
      apiEnvironmentName: "staging",
      cacheDirectory,
      cacheDurationMs: 60_000,
      createToken: mockCreateToken,
      lockRetryDelayMs: 1,
      lockRetryJitterMs: 0,
    };

    const firstPromise = getOrCreateAdminAuthToken(input);
    const secondPromise = getOrCreateAdminAuthToken(input);
    await vi.waitFor(() => {
      expect(mockCreateToken).toHaveBeenCalledTimes(1);
    });
    resolveToken?.("Bearer shared-token");

    const [first, second] = await Promise.all([firstPromise, secondPromise]);

    expect(first).toEqual(second);
    expect(first.authToken).toBe("Bearer shared-token");
    expect(mockCreateToken).toHaveBeenCalledTimes(1);
  });

  it("does not expose the admin email in cache file names", async () => {
    await getOrCreateAdminAuthToken({
      adminEmail: "e2e@clipboardhealth.com",
      apiEnvironmentName: "pr/123",
      cacheDirectory,
      cacheDurationMs: 60_000,
      createToken: async () => "Bearer generated-token",
    });

    const cacheDirectoryEntries = await readdir(cacheDirectory);
    const cacheFileNames = cacheDirectoryEntries.filter((fileName) => fileName.endsWith(".json"));
    expect(cacheFileNames).toHaveLength(1);
    const [cacheFileName = ""] = cacheFileNames;
    const fileContents = await readFile(path.join(cacheDirectory, cacheFileName), "utf8");

    expect(cacheFileName).not.toContain("e2e@clipboardhealth.com");
    expect(cacheFileName).toContain("pr_123");
    expect(JSON.parse(fileContents)).toMatchObject({
      authToken: "Bearer generated-token",
    });
  });

  it("keeps cache entries distinct when environment names sanitize identically", async () => {
    const commonInput = {
      adminEmail: "e2e@clipboardhealth.com",
      cacheDirectory,
      cacheDurationMs: 60_000,
    };

    const slashEnvironment = await getOrCreateAdminAuthToken({
      ...commonInput,
      apiEnvironmentName: "pr/123",
      createToken: async () => "Bearer slash-environment",
    });
    const underscoreEnvironment = await getOrCreateAdminAuthToken({
      ...commonInput,
      apiEnvironmentName: "pr_123",
      createToken: async () => "Bearer underscore-environment",
    });

    expect(slashEnvironment.authToken).toBe("Bearer slash-environment");
    expect(underscoreEnvironment.authToken).toBe("Bearer underscore-environment");
    await expect(readdir(cacheDirectory)).resolves.toHaveLength(2);
  });

  it("keeps tokens for different explicit cache identities distinct", async () => {
    const commonInput = {
      adminEmail: "e2e@clipboardhealth.com",
      apiEnvironmentName: "staging",
      cacheDirectory,
      cacheDurationMs: 60_000,
    };

    const mobileToken = await getOrCreateAdminAuthToken({
      ...commonInput,
      cacheIdentity: {
        namespace: "cbh-mobile-app",
        clientName: "mobile-app",
        tokenKind: "access",
      },
      createToken: async () => "Bearer mobile-token",
    });
    const adminToken = await getOrCreateAdminAuthToken({
      ...commonInput,
      cacheIdentity: {
        namespace: "cbh-admin-frontend",
        clientName: "admin-app",
        tokenKind: "access",
      },
      createToken: async () => "Bearer admin-token",
    });

    expect(mobileToken.authToken).toBe("Bearer mobile-token");
    expect(adminToken.authToken).toBe("Bearer admin-token");
    await expect(readdir(cacheDirectory)).resolves.toHaveLength(2);
  });

  it("normalizes explicit cache identity field order", async () => {
    const mockCreateToken = vi
      .fn<() => Promise<string>>()
      .mockResolvedValueOnce("Bearer shared-token");
    const commonInput = {
      adminEmail: "e2e@clipboardhealth.com",
      apiEnvironmentName: "staging",
      cacheDirectory,
      cacheDurationMs: 60_000,
      createToken: mockCreateToken,
    };

    const first = await getOrCreateAdminAuthToken({
      ...commonInput,
      cacheIdentity: {
        namespace: "cbh-mobile-app",
        clientName: "mobile-app",
        tokenKind: "access",
      },
    });
    const second = await getOrCreateAdminAuthToken({
      ...commonInput,
      cacheIdentity: {
        tokenKind: "access",
        clientName: "mobile-app",
        namespace: "cbh-mobile-app",
      },
    });

    expect(first).toEqual(second);
    expect(mockCreateToken).toHaveBeenCalledTimes(1);
  });

  it("bounds cache freshness to the JWT expiration with safety skew", async () => {
    const nowMs = 1_000_000;
    const jwtExpiresAtMs = nowMs + 120_000;
    const authToken = createJwtBearerToken({ expiresAtMs: jwtExpiresAtMs });

    const actual = await getOrCreateAdminAuthToken({
      adminEmail: "e2e@clipboardhealth.com",
      apiEnvironmentName: "staging",
      cacheDirectory,
      cacheDurationMs: 10 * 60_000,
      createToken: async () => authToken,
      jwtExpirationSafetySkewMs: 60_000,
      nowImplementation: () => nowMs,
    });
    const cached = await getOrCreateAdminAuthToken({
      adminEmail: "e2e@clipboardhealth.com",
      apiEnvironmentName: "staging",
      cacheDirectory,
      cacheDurationMs: 10 * 60_000,
      createToken: async () => authToken,
      jwtExpirationSafetySkewMs: 60_000,
      nowImplementation: () => nowMs,
    });

    expect(actual.expiresAtMs).toBe(jwtExpiresAtMs - 60_000);
    expect(cached.expiresAtMs).toBe(actual.expiresAtMs);
  });

  it("evicts a rejected cached token before sharing one fresh replacement", async () => {
    const mockCreateToken = vi
      .fn<() => Promise<string>>()
      .mockResolvedValueOnce("Bearer rejected-token")
      .mockResolvedValueOnce("Bearer accepted-token");
    const mockValidateToken = vi
      .fn<(params: { authToken: string }) => Promise<boolean>>()
      .mockResolvedValueOnce(false)
      .mockResolvedValueOnce(true);
    const commonInput = {
      adminEmail: "e2e@clipboardhealth.com",
      apiEnvironmentName: "staging",
      cacheDirectory,
      cacheDurationMs: 60_000,
      createToken: mockCreateToken,
    };
    await getOrCreateAdminAuthToken(commonInput);

    const actual = await getOrCreateAdminAuthToken({
      ...commonInput,
      validationPolicy: "admin-session-v1",
      validateToken: mockValidateToken,
    });

    expect(actual.authToken).toBe("Bearer accepted-token");
    expect(mockCreateToken).toHaveBeenCalledTimes(2);
    expect(mockValidateToken).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        authToken: "Bearer rejected-token",
      }),
    );
  });

  it("shares one replacement when concurrent callers reject the cached token", async () => {
    const mockCreateToken = vi
      .fn<() => Promise<string>>()
      .mockResolvedValueOnce("Bearer rejected-token")
      .mockResolvedValueOnce("Bearer accepted-token");
    const commonInput = {
      adminEmail: "e2e@clipboardhealth.com",
      apiEnvironmentName: "staging",
      cacheDirectory,
      cacheDurationMs: 60_000,
      createToken: mockCreateToken,
      lockRetryDelayMs: 1,
      lockRetryJitterMs: 0,
    };
    await getOrCreateAdminAuthToken(commonInput);
    const mockValidateToken = vi.fn<(params: { authToken: string }) => Promise<boolean>>(
      async ({ authToken }) => authToken === "Bearer accepted-token",
    );

    const [first, second] = await Promise.all([
      getOrCreateAdminAuthToken({
        ...commonInput,
        validationPolicy: "admin-session-v1",
        validateToken: mockValidateToken,
      }),
      getOrCreateAdminAuthToken({
        ...commonInput,
        validationPolicy: "admin-session-v1",
        validateToken: mockValidateToken,
      }),
    ]);

    expect(first.authToken).toBe("Bearer accepted-token");
    expect(second.authToken).toBe("Bearer accepted-token");
    expect(mockCreateToken).toHaveBeenCalledTimes(2);
    expect(mockValidateToken).toHaveBeenCalledTimes(2);
  });

  it("shares successful validation across cache readers", async () => {
    const mockValidateToken = vi.fn<() => Promise<boolean>>(async () => true);
    const input = {
      adminEmail: "e2e@clipboardhealth.com",
      apiEnvironmentName: "staging",
      cacheDirectory,
      cacheDurationMs: 60_000,
      createToken: async () => "Bearer validated-token",
      validationPolicy: "admin-session-v1",
      validateToken: mockValidateToken,
    };

    await getOrCreateAdminAuthToken(input);
    const actual = await getOrCreateAdminAuthToken(input);

    expect(actual.authToken).toBe("Bearer validated-token");
    expect(mockValidateToken).toHaveBeenCalledTimes(1);
  });

  it("replaces a cached token that expires during validation", async () => {
    let nowMs = 1_000_000;
    const cacheEvents: string[] = [];
    const mockCreateToken = vi
      .fn<() => Promise<string>>()
      .mockResolvedValueOnce("Bearer expiring-token")
      .mockResolvedValueOnce("Bearer replacement-token");
    const commonInput = {
      adminEmail: "e2e@clipboardhealth.com",
      apiEnvironmentName: "staging",
      cacheDirectory,
      cacheDurationMs: 10,
      createToken: mockCreateToken,
      nowImplementation: () => nowMs,
      onCacheEvent: (event: { kind: string }) => {
        cacheEvents.push(event.kind);
      },
    };
    await getOrCreateAdminAuthToken(commonInput);

    const actual = await getOrCreateAdminAuthToken({
      ...commonInput,
      validationPolicy: "admin-session-v1",
      validateToken: async () => {
        nowMs += 10;
        return true;
      },
    });

    expect(actual.authToken).toBe("Bearer replacement-token");
    expect(mockCreateToken).toHaveBeenCalledTimes(2);
    expect(cacheEvents).not.toContain("validation-rejected");
  });

  it("keeps the cached token when validation infrastructure fails", async () => {
    const mockCreateToken = vi
      .fn<() => Promise<string>>()
      .mockResolvedValueOnce("Bearer cached-token");
    const input = {
      adminEmail: "e2e@clipboardhealth.com",
      apiEnvironmentName: "staging",
      cacheDirectory,
      cacheDurationMs: 60_000,
      createToken: mockCreateToken,
    };
    await getOrCreateAdminAuthToken(input);

    await expect(
      getOrCreateAdminAuthToken({
        ...input,
        validationPolicy: "admin-session-v1",
        validateToken: async () => {
          throw new Error("Validation endpoint unavailable");
        },
      }),
    ).rejects.toThrow("Validation endpoint unavailable");
    const actual = await getOrCreateAdminAuthToken(input);

    expect(actual.authToken).toBe("Bearer cached-token");
    expect(mockCreateToken).toHaveBeenCalledTimes(1);
  });

  it("revalidates when the validation policy changes", async () => {
    const firstPolicyValidator = vi.fn<() => Promise<boolean>>(async () => true);
    const secondPolicyValidator = vi.fn<() => Promise<boolean>>(async () => true);
    const commonInput = {
      adminEmail: "e2e@clipboardhealth.com",
      apiEnvironmentName: "staging",
      cacheDirectory,
      cacheDurationMs: 60_000,
      createToken: async () => "Bearer validated-token",
    };
    await getOrCreateAdminAuthToken({
      ...commonInput,
      validationPolicy: "admin-session-v1",
      validateToken: firstPolicyValidator,
    });

    const actual = await getOrCreateAdminAuthToken({
      ...commonInput,
      validationPolicy: "admin-session-v2",
      validateToken: secondPolicyValidator,
    });

    expect(actual.authToken).toBe("Bearer validated-token");
    expect(firstPolicyValidator).toHaveBeenCalledTimes(1);
    expect(secondPolicyValidator).toHaveBeenCalledTimes(1);
  });

  it("requires an explicit policy and bounds token validation time", async () => {
    const commonInput = {
      adminEmail: "e2e@clipboardhealth.com",
      apiEnvironmentName: "staging",
      cacheDirectory,
      cacheDurationMs: 60_000,
      createToken: async () => "Bearer generated-token",
    };

    await expect(
      getOrCreateAdminAuthToken({
        ...commonInput,
        validateToken: async () => true,
      }),
    ).rejects.toThrow("validationPolicy must be provided");
    await expect(
      getOrCreateAdminAuthToken({
        ...commonInput,
        validationPolicy: "admin-session-v1",
        validationTimeoutMs: 5,
        validateToken: async ({ signal }) =>
          await new Promise<boolean>((_resolve, reject) => {
            signal.addEventListener(
              "abort",
              () => {
                reject(new Error("Validation aborted"));
              },
              { once: true },
            );
          }),
      }),
    ).rejects.toThrow("Admin auth token validation timed out after 5ms");
  });

  it("times out lock contention even when token time is fixed", async () => {
    let resolveToken: ((value: string) => void) | undefined;
    const tokenPromise = new Promise<string>((resolve) => {
      resolveToken = resolve;
    });
    const mockCreateToken = vi.fn<() => Promise<string>>(async () => await tokenPromise);
    const commonInput = {
      adminEmail: "e2e@clipboardhealth.com",
      apiEnvironmentName: "staging",
      cacheDirectory,
      cacheDurationMs: 60_000,
      createToken: mockCreateToken,
      lockRetryDelayMs: 1,
      lockRetryJitterMs: 0,
      nowImplementation: () => 1_000_000,
    };
    const firstPromise = getOrCreateAdminAuthToken(commonInput);
    await vi.waitFor(() => {
      expect(mockCreateToken).toHaveBeenCalledTimes(1);
    });

    await expect(
      getOrCreateAdminAuthToken({
        ...commonInput,
        lockWaitTimeoutMs: 25,
      }),
    ).rejects.toThrow("Timed out waiting for admin auth token cache lock");
    resolveToken?.("Bearer generated-token");
    await firstPromise;
  });

  it("supports explicit invalidation and forced refresh", async () => {
    const mockCreateToken = vi
      .fn<() => Promise<string>>()
      .mockResolvedValueOnce("Bearer first-token")
      .mockResolvedValueOnce("Bearer forced-token")
      .mockResolvedValueOnce("Bearer after-invalidation-token");
    const input = {
      adminEmail: "e2e@clipboardhealth.com",
      apiEnvironmentName: "staging",
      cacheDirectory,
      cacheDurationMs: 60_000,
      createToken: mockCreateToken,
    };
    await getOrCreateAdminAuthToken(input);

    const forced = await getOrCreateAdminAuthToken({
      ...input,
      forceRefresh: true,
    });
    await invalidateAdminAuthToken(input);
    const afterInvalidation = await getOrCreateAdminAuthToken(input);

    expect(forced.authToken).toBe("Bearer forced-token");
    expect(afterInvalidation.authToken).toBe("Bearer after-invalidation-token");
    expect(mockCreateToken).toHaveBeenCalledTimes(3);
  });

  it("does not retain the previous token when forced refresh fails", async () => {
    const mockCreateToken = vi
      .fn<() => Promise<string>>()
      .mockResolvedValueOnce("Bearer rejected-token")
      .mockRejectedValueOnce(new Error("Token mint unavailable"))
      .mockResolvedValueOnce("Bearer recovered-token");
    const input = {
      adminEmail: "e2e@clipboardhealth.com",
      apiEnvironmentName: "staging",
      cacheDirectory,
      cacheDurationMs: 60_000,
      createToken: mockCreateToken,
    };
    await getOrCreateAdminAuthToken(input);

    await expect(
      getOrCreateAdminAuthToken({
        ...input,
        forceRefresh: true,
      }),
    ).rejects.toThrow("Token mint unavailable");
    const actual = await getOrCreateAdminAuthToken(input);

    expect(actual.authToken).toBe("Bearer recovered-token");
    expect(mockCreateToken).toHaveBeenCalledTimes(3);
  });

  it("emits cache diagnostics without the token or admin email", async () => {
    const cacheEvents: unknown[] = [];
    const input = {
      adminEmail: "e2e@clipboardhealth.com",
      apiEnvironmentName: "staging",
      cacheDirectory,
      cacheDurationMs: 60_000,
      createToken: async () => "Bearer generated-token",
      onCacheEvent: (event: unknown) => {
        cacheEvents.push(event);
      },
    };

    await getOrCreateAdminAuthToken(input);
    await getOrCreateAdminAuthToken(input);

    expect(cacheEvents).toEqual([
      expect.objectContaining({ kind: "miss" }),
      expect.objectContaining({ kind: "created" }),
      expect.objectContaining({ kind: "hit" }),
    ]);
    expect(JSON.stringify(cacheEvents)).not.toContain("generated-token");
    expect(JSON.stringify(cacheEvents)).not.toContain("e2e@clipboardhealth.com");
  });

  it("ignores rejected asynchronous cache diagnostics", async () => {
    const actual = await getOrCreateAdminAuthToken({
      adminEmail: "e2e@clipboardhealth.com",
      apiEnvironmentName: "staging",
      cacheDirectory,
      cacheDurationMs: 60_000,
      createToken: async () => "Bearer generated-token",
      onCacheEvent: async () => {
        throw new Error("Diagnostic sink unavailable");
      },
    });
    await new Promise<void>((resolve) => {
      setImmediate(resolve);
    });

    expect(actual.authToken).toBe("Bearer generated-token");
  });

  it("rejects malformed generated tokens without caching them", async () => {
    const input = {
      adminEmail: "e2e@clipboardhealth.com",
      apiEnvironmentName: "staging",
      cacheDirectory,
      cacheDurationMs: 60_000,
      createToken: vi
        .fn<() => Promise<string>>()
        .mockResolvedValueOnce("invalid-token")
        .mockResolvedValueOnce("Bearer recovered-token"),
    };

    await expect(getOrCreateAdminAuthToken(input)).rejects.toThrow(
      "Generated admin auth token is malformed",
    );
    await expect(getOrCreateAdminAuthToken(input)).resolves.toMatchObject({
      authToken: "Bearer recovered-token",
    });
  });

  it("retries approved transient CLI failures and caches the generated token", async () => {
    const mockCommandRunner = vi
      .fn<AdminAuthTokenCommandRunner>()
      .mockRejectedValueOnce(
        new Error("Error initiating custom challenge MAKE_TEST_TOKEN: Too many requests"),
      )
      .mockResolvedValueOnce({ stdout: "generated-token\n", stderr: "" });

    const actual = await generateAdminAuthToken({
      adminEmail: "e2e@clipboardhealth.com",
      apiEnvironmentName: "staging",
      cacheDirectory,
      cacheDurationMs: 60_000,
      commandRunner: mockCommandRunner,
      sleepImplementation: async () => {
        await Promise.resolve();
      },
      retryJitterMs: 0,
    });

    expect(actual.authToken).toBe("Bearer generated-token");
    expect(mockCommandRunner).toHaveBeenCalledTimes(2);
  });

  it("derives distinct cache identities from different CLI client names", async () => {
    const mockCommandRunner = vi
      .fn<AdminAuthTokenCommandRunner>()
      .mockResolvedValueOnce({ stdout: "mobile-token\n", stderr: "" })
      .mockResolvedValueOnce({ stdout: "admin-token\n", stderr: "" });
    const commonInput = {
      adminEmail: "e2e@clipboardhealth.com",
      apiEnvironmentName: "staging",
      cacheIdentity: {
        namespace: "consumer-repository",
        tokenKind: "access",
      },
      cacheDirectory,
      cacheDurationMs: 60_000,
      commandRunner: mockCommandRunner,
    };

    const mobileToken = await generateAdminAuthToken({
      ...commonInput,
      clientName: "mobile-app",
    });
    const adminToken = await generateAdminAuthToken({
      ...commonInput,
      clientName: "admin-app",
    });

    expect(mobileToken.authToken).toBe("Bearer mobile-token");
    expect(adminToken.authToken).toBe("Bearer admin-token");
    expect(mockCommandRunner).toHaveBeenCalledTimes(2);
  });

  it("retries CLI timeouts reported through an error cause", async () => {
    const timeoutCause = {
      code: "ETIMEDOUT",
      killed: true,
      signal: "SIGTERM",
    };
    const mockCommandRunner = vi
      .fn<AdminAuthTokenCommandRunner>()
      .mockRejectedValueOnce(new Error("Command failed", { cause: timeoutCause }))
      .mockResolvedValueOnce({ stdout: "generated-token\n", stderr: "" });

    const actual = await generateAdminAuthToken({
      adminEmail: "e2e@clipboardhealth.com",
      apiEnvironmentName: "staging",
      cacheDirectory,
      cacheDurationMs: 60_000,
      commandRunner: mockCommandRunner,
      sleepImplementation: async () => {
        await Promise.resolve();
      },
      retryJitterMs: 0,
    });

    expect(actual.authToken).toBe("Bearer generated-token");
    expect(mockCommandRunner).toHaveBeenCalledTimes(2);
  });

  it("does not retry or expose the admin email for deterministic CLI failures", async () => {
    const mockCommandRunner = vi
      .fn<AdminAuthTokenCommandRunner>()
      .mockRejectedValue(new Error("invalid request for user"));

    const actualPromise = generateAdminAuthToken({
      adminEmail: "e2e@clipboardhealth.com",
      apiEnvironmentName: "staging",
      cacheDirectory,
      cacheDurationMs: 60_000,
      commandRunner: mockCommandRunner,
      sleepImplementation: async () => {
        await Promise.resolve();
      },
    });

    await expect(actualPromise).rejects.not.toThrow("e2e@clipboardhealth.com");
    expect(mockCommandRunner).toHaveBeenCalledTimes(1);
  });
});

function createJwtBearerToken(params: { expiresAtMs: number }): string {
  const header = Buffer.from(JSON.stringify({ algorithm: "none" })).toString("base64url");
  const payload = Buffer.from(
    JSON.stringify({ exp: Math.floor(params.expiresAtMs / 1000) }),
  ).toString("base64url");

  return `Bearer ${header}.${payload}.signature`;
}
