import { type RetryAttemptContext, type RetryError, runWithRetry } from "../index";

describe("runWithRetry", () => {
  it("retries only errors approved by the classified transient predicate", async () => {
    const input = new Error("service unavailable");
    const mockOperation = vi
      .fn<(context: RetryAttemptContext) => Promise<string>>()
      .mockRejectedValueOnce(input)
      .mockResolvedValueOnce("ready");
    const sleepDurations: number[] = [];

    const actual = await runWithRetry({
      operationName: "load readiness",
      operation: mockOperation,
      mode: {
        kind: "classified",
        maxAttempts: 3,
        delayMs: 25,
        isTransient: ({ error }) => error === input,
      },
      sleepImplementation: async ({ durationMs }) => {
        sleepDurations.push(durationMs);
      },
    });

    expect(actual).toEqual({ value: "ready", attempts: 2 });
    expect(sleepDurations).toEqual([25]);
  });

  it("bails immediately with rich context for non-transient failures", async () => {
    const input = new Error("invalid request");

    const actualPromise = runWithRetry({
      operationName: "create worker",
      operation: async () => await Promise.reject(input),
      mode: {
        kind: "classified",
        maxAttempts: 5,
        isTransient: () => false,
      },
    });

    await expect(actualPromise).rejects.toMatchObject({
      name: "RetryError",
      operationName: "create worker",
      attempts: 1,
      reason: "non-transient",
      cause: input,
    });
  });

  it("polls until pass within a timeout budget", async () => {
    let currentTimeMs = 0;
    const mockOperation = vi
      .fn<(context: RetryAttemptContext) => Promise<string>>()
      .mockRejectedValueOnce(new Error("not ready"))
      .mockRejectedValueOnce(new Error("still not ready"))
      .mockResolvedValueOnce("ready");

    const actual = await runWithRetry({
      operationName: "wait for mail",
      operation: mockOperation,
      mode: {
        kind: "poll",
        timeoutMs: 1000,
        intervalsMs: [100, 200],
      },
      nowImplementation: () => currentTimeMs,
      sleepImplementation: async ({ durationMs }) => {
        currentTimeMs += durationMs;
      },
    });

    expect(actual).toEqual({ value: "ready", attempts: 3 });
  });

  it("reports poll timeout exhaustion with the last error", async () => {
    let currentTimeMs = 0;
    const input = new Error("not ready");

    const actualPromise = runWithRetry({
      operationName: "wait for deployment",
      operation: async () => await Promise.reject(input),
      mode: {
        kind: "poll",
        timeoutMs: 250,
        intervalsMs: [100],
      },
      nowImplementation: () => currentTimeMs,
      sleepImplementation: async ({ durationMs }) => {
        currentTimeMs += durationMs;
      },
    });

    await expect(actualPromise).rejects.toEqual(
      expect.objectContaining<Partial<RetryError>>({
        reason: "timeout",
        attempts: 3,
        cause: input,
      }),
    );
  });

  it("enforces the poll timeout when an attempt does not settle", async () => {
    vi.useFakeTimers();

    try {
      const actualPromise = runWithRetry({
        operationName: "wait for hung probe",
        operation: async () =>
          await new Promise<string>(() => {
            // Intentionally pending to exercise the hard poll deadline.
          }),
        mode: {
          kind: "poll",
          timeoutMs: 100,
        },
      });
      await Promise.all([
        expect(actualPromise).rejects.toMatchObject({
          reason: "timeout",
          attempts: 1,
        }),
        vi.advanceTimersByTimeAsync(100),
      ]);
    } finally {
      vi.useRealTimers();
    }
  });
});
