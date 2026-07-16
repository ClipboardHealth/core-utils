import { mkdtemp, readdir, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import {
  type AdminAuthTokenCommandRunner,
  generateAdminAuthToken,
  getOrCreateAdminAuthToken,
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
