import {
  createMailpitClient,
  extractEmailOtpCodeFromMailpitMessage,
  extractMagicLinkFromMailpitMessage,
  fetchEmailOtpCodeFromMailpit,
  fetchMagicLinkFromMailpit,
  type MailpitClient,
  type MailpitMessage,
  type MailpitMessageSummary,
  MailpitRequestError,
} from "../index";

describe("Mailpit polling", () => {
  it("returns the newest non-excluded magic link", async () => {
    const messages = [
      createSearchSummary({ id: "new", created: "2026-07-16T12:00:00.000Z" }),
      createSearchSummary({ id: "old", created: "2026-07-16T11:00:00.000Z" }),
    ];
    const mockClient: MailpitClient = {
      searchMessages: vi.fn<MailpitClient["searchMessages"]>(async () => messages),
      getMessage: vi.fn<MailpitClient["getMessage"]>(async ({ messageId }) =>
        createMessage({
          id: messageId,
          text: `https://app.test/v2/email-login-link?payload=${messageId}`,
        }),
      ),
    };

    const actual = await fetchMagicLinkFromMailpit({
      client: mockClient,
      email: "user@example.test",
      excludeLinks: ["https://app.test/v2/email-login-link?payload=new"],
      timeoutMs: 1000,
    });

    expect(actual).toEqual({
      value: "https://app.test/v2/email-login-link?payload=old",
      messageId: "old",
      messageCreatedAt: "2026-07-16T11:00:00.000Z",
      pollingDiagnostics: {
        searchAttempts: 1,
        rawResultCount: 2,
        postSentAfterCandidateCount: 2,
        invalidOrMissingTimestampCount: 0,
        fetchedMessageCount: 2,
        extractionMissCount: 0,
        excludedValueCount: 1,
        transientRequestErrorCount: 0,
        transientRequestErrorStatuses: [],
        newestCandidateTimestamp: "2026-07-16T12:00:00.000Z",
      },
    });
  });

  it("extracts an eight-digit Cognito email OTP split across HTML elements", async () => {
    const mockClient: MailpitClient = {
      searchMessages: vi.fn<MailpitClient["searchMessages"]>(async () => [
        createSearchSummary({ id: "otp" }),
      ]),
      getMessage: vi.fn<MailpitClient["getMessage"]>(async () =>
        createMessage({
          id: "otp",
          html: "<style>.x{}</style><div>8102 <span>7033</span></div>",
        }),
      ),
    };

    const actual = await fetchEmailOtpCodeFromMailpit({
      client: mockClient,
      email: "user@example.test",
      timeoutMs: 1000,
    });

    expect(actual).toEqual({
      value: "81027033",
      messageId: "otp",
      messageCreatedAt: "2026-07-16T12:00:00.000Z",
      pollingDiagnostics: {
        searchAttempts: 1,
        rawResultCount: 1,
        postSentAfterCandidateCount: 1,
        invalidOrMissingTimestampCount: 0,
        fetchedMessageCount: 1,
        extractionMissCount: 0,
        excludedValueCount: 0,
        transientRequestErrorCount: 0,
        transientRequestErrorStatuses: [],
        newestCandidateTimestamp: "2026-07-16T12:00:00.000Z",
      },
    });
  });

  it("uses authenticated Mailpit HTTP search and message endpoints", async () => {
    const mockFetch = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            messages: [createSearchSummary({ id: "message-1" })],
          }),
          { status: 200 },
        ),
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify(createMessage({ id: "message-1", text: "body" })), {
          status: 200,
        }),
      );
    const client = createMailpitClient({
      baseUrl: "https://mailpit.example.test/api/v1",
      password: "secret",
      fetchImplementation: mockFetch,
    });

    const searchResult = await client.searchMessages({
      query: "to:user@example.test",
    });
    const messageResult = await client.getMessage({ messageId: "message-1" });

    expect(searchResult).toHaveLength(1);
    expect(messageResult.Text).toBe("body");
    expect(mockFetch).toHaveBeenNthCalledWith(
      1,
      "https://mailpit.example.test/api/v1/search?query=to%3Auser%40example.test",
      expect.objectContaining({
        headers: {
          authorization: `Basic ${Buffer.from("cbh:secret").toString("base64")}`,
        },
      }),
    );
    expect(mockFetch).toHaveBeenNthCalledWith(
      2,
      "https://mailpit.example.test/api/v1/message/message-1",
      expect.any(Object),
    );
  });

  it("keeps Mailpit search summaries that omit full-message fields", async () => {
    const searchSummary = {
      ID: "message-1",
      Created: "2026-07-16T12:00:00.000Z",
      From: { Address: "noreply@example.test", Name: "Clipboard" },
      To: [{ Address: "user@example.test", Name: "User" }],
      Subject: "Sign in",
    };
    const client = createMailpitClient({
      baseUrl: "https://mailpit.example.test/api/v1",
      password: "secret",
      fetchImplementation: vi.fn<typeof fetch>(
        async () =>
          new Response(JSON.stringify({ messages: [searchSummary] }), {
            status: 200,
          }),
      ),
    });

    await expect(client.searchMessages({ query: "to:user@example.test" })).resolves.toEqual([
      searchSummary,
    ]);
  });

  it("keeps Mailpit search summaries with a null creation timestamp", async () => {
    const searchSummary = {
      ID: "message-1",
      Created: null,
      From: { Address: "noreply@example.test", Name: "Clipboard" },
      To: [{ Address: "user@example.test", Name: "User" }],
      Subject: "Sign in",
    };
    const client = createMailpitClient({
      baseUrl: "https://mailpit.example.test/api/v1",
      password: "secret",
      fetchImplementation: vi.fn<typeof fetch>(
        async () =>
          new Response(JSON.stringify({ messages: [searchSummary] }), {
            status: 200,
          }),
      ),
    });

    await expect(client.searchMessages({ query: "to:user@example.test" })).resolves.toEqual([
      searchSummary,
    ]);
  });

  it("does not retry malformed Mailpit response schemas", async () => {
    let currentTimeMs = 0;
    const mockFetch = vi.fn<typeof fetch>(
      async () =>
        new Response(JSON.stringify({ messages: "malformed" }), {
          status: 200,
        }),
    );
    const client = createMailpitClient({
      baseUrl: "https://mailpit.example.test/api/v1",
      password: "secret",
      fetchImplementation: mockFetch,
    });

    const actualPromise = fetchMagicLinkFromMailpit({
      client,
      email: "user@example.test",
      timeoutMs: 1000,
      pollIntervalMs: 100,
      nowImplementation: () => currentTimeMs,
      sleepImplementation: async ({ durationMs }) => {
        currentTimeMs += durationMs;
      },
    });

    await expect(actualPromise).rejects.toMatchObject({
      attempts: 1,
      reason: "non-transient",
    });
    expect(mockFetch).toHaveBeenCalledTimes(1);
  });

  it("searches HTML for a magic link when the text body has no link", () => {
    const actual = extractMagicLinkFromMailpitMessage({
      message: createMessage({
        id: "magic-link",
        text: "Open the HTML version to continue.",
        html: '<a href="https://app.test/v2/email-login-link?payload=html">Sign in</a>',
      }),
    });

    expect(actual).toBe("https://app.test/v2/email-login-link?payload=html");
  });

  it("searches HTML for an OTP when the text body has no code", () => {
    const actual = extractEmailOtpCodeFromMailpitMessage({
      message: createMessage({
        id: "otp",
        text: "Open the HTML version to see your code.",
        html: "<div>8102 <span>7033</span></div>",
      }),
    });

    expect(actual).toBe("81027033");
  });

  it("polls again when no matching message is ready", async () => {
    let currentTimeMs = 0;
    const mockClient: MailpitClient = {
      searchMessages: vi
        .fn<MailpitClient["searchMessages"]>()
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([createSearchSummary({ id: "ready" })]),
      getMessage: vi.fn<MailpitClient["getMessage"]>(async () =>
        createMessage({
          id: "ready",
          text: "https://app.test/v2/email-login-link?payload=ready",
        }),
      ),
    };

    const actual = await fetchMagicLinkFromMailpit({
      client: mockClient,
      email: "user@example.test",
      timeoutMs: 5000,
      pollIntervalMs: 100,
      nowImplementation: () => currentTimeMs,
      sleepImplementation: async ({ durationMs }) => {
        currentTimeMs += durationMs;
      },
    });

    expect(actual.value).toContain("payload=ready");
    expect(mockClient.searchMessages).toHaveBeenCalledTimes(2);
  });

  it("does not refetch unchanged messages across polling attempts", async () => {
    let currentTimeMs = 0;
    const staleMessage = createSearchSummary({ id: "stale" });
    const readyMessage = createSearchSummary({
      id: "ready",
      created: "2026-07-16T12:01:00.000Z",
    });
    const mockGetMessage = vi
      .fn<MailpitClient["getMessage"]>()
      .mockResolvedValueOnce(createMessage({ id: "stale", text: "no link yet" }))
      .mockResolvedValueOnce(
        createMessage({
          id: "ready",
          text: "https://app.test/v2/email-login-link?payload=ready",
        }),
      );
    const mockClient: MailpitClient = {
      searchMessages: vi
        .fn<MailpitClient["searchMessages"]>()
        .mockResolvedValueOnce([staleMessage])
        .mockResolvedValueOnce([readyMessage, staleMessage]),
      getMessage: mockGetMessage,
    };

    const actual = await fetchMagicLinkFromMailpit({
      client: mockClient,
      email: "user@example.test",
      timeoutMs: 5000,
      pollIntervalMs: 100,
      nowImplementation: () => currentTimeMs,
      sleepImplementation: async ({ durationMs }) => {
        currentTimeMs += durationMs;
      },
    });

    expect(actual.messageId).toBe("ready");
    expect(mockGetMessage).toHaveBeenCalledTimes(2);
    expect(mockGetMessage).toHaveBeenCalledWith({ messageId: "stale" });
    expect(mockGetMessage).toHaveBeenCalledWith({ messageId: "ready" });
  });

  it("does not include the recipient email in timeout errors", async () => {
    let currentTimeMs = 0;
    const email = "sensitive-user@example.test";
    const mockClient: MailpitClient = {
      searchMessages: vi.fn<MailpitClient["searchMessages"]>(async () => []),
      getMessage: vi.fn<MailpitClient["getMessage"]>(),
    };

    const actualPromise = fetchMagicLinkFromMailpit({
      client: mockClient,
      email,
      timeoutMs: 100,
      pollIntervalMs: 100,
      nowImplementation: () => currentTimeMs,
      sleepImplementation: async ({ durationMs }) => {
        currentTimeMs += durationMs;
      },
    });

    await expect(actualPromise).rejects.not.toThrow(email);
  });

  it("reports when Mailpit searches return no messages", async () => {
    const mockClient: MailpitClient = {
      searchMessages: vi.fn<MailpitClient["searchMessages"]>(async () => []),
      getMessage: vi.fn<MailpitClient["getMessage"]>(),
    };

    const actualPromise = fetchMagicLinkFromMailpit({
      client: mockClient,
      email: "user@example.test",
      ...createImmediateTimeout(),
    });

    await expect(actualPromise).rejects.toThrow(
      "Polling snapshot: searchAttempts=1, rawResultCount=0, " +
        "postSentAfterCandidateCount=0, invalidOrMissingTimestampCount=0, " +
        "fetchedMessageCount=0, extractionMissCount=0, excludedValueCount=0, " +
        "transientRequestErrorCount=0, transientRequestErrorStatuses=[], " +
        "newestCandidateAgeMs=unavailable",
    );
  });

  it("reports the polling snapshot when a Mailpit request consumes the timeout budget", async () => {
    const mockClient: MailpitClient = {
      searchMessages: vi.fn<MailpitClient["searchMessages"]>(
        async () =>
          await new Promise<MailpitMessageSummary[]>(() => {
            // The request remains pending until the polling deadline.
          }),
      ),
      getMessage: vi.fn<MailpitClient["getMessage"]>(),
    };

    const actualPromise = fetchMagicLinkFromMailpit({
      client: mockClient,
      email: "user@example.test",
      timeoutMs: 5,
    });

    await expect(actualPromise).rejects.toThrow(
      "Polling snapshot: searchAttempts=1, rawResultCount=0, " +
        "postSentAfterCandidateCount=0, invalidOrMissingTimestampCount=0, " +
        "fetchedMessageCount=0, extractionMissCount=0, excludedValueCount=0, " +
        "transientRequestErrorCount=0, transientRequestErrorStatuses=[], " +
        "newestCandidateAgeMs=unavailable",
    );
  });

  it("reports when sentAfter filters every Mailpit search result", async () => {
    const mockClient: MailpitClient = {
      searchMessages: vi.fn<MailpitClient["searchMessages"]>(async () => [
        createSearchSummary({
          id: "too-old",
          created: "2026-07-16T11:00:00.000Z",
        }),
      ]),
      getMessage: vi.fn<MailpitClient["getMessage"]>(),
    };

    const actualPromise = fetchMagicLinkFromMailpit({
      client: mockClient,
      email: "user@example.test",
      sentAfter: new Date("2026-07-16T12:00:00.000Z"),
      ...createImmediateTimeout(),
    });

    await expect(actualPromise).rejects.toThrow(
      "Polling snapshot: searchAttempts=1, rawResultCount=1, " +
        "postSentAfterCandidateCount=0, invalidOrMissingTimestampCount=0, " +
        "fetchedMessageCount=0, extractionMissCount=0, excludedValueCount=0, " +
        "transientRequestErrorCount=0, transientRequestErrorStatuses=[], " +
        "newestCandidateAgeMs=unavailable",
    );
  });

  it("reports transient Mailpit message fetch failures and statuses", async () => {
    const mockClient: MailpitClient = {
      searchMessages: vi.fn<MailpitClient["searchMessages"]>(async () => [
        createSearchSummary({ id: "unavailable" }),
      ]),
      getMessage: vi.fn<MailpitClient["getMessage"]>(async () => {
        throw new MailpitRequestError({
          message: "upstream unavailable",
          status: 503,
        });
      }),
    };

    const actualPromise = fetchMagicLinkFromMailpit({
      client: mockClient,
      email: "user@example.test",
      ...createImmediateTimeout(),
    });

    await expect(actualPromise).rejects.toThrow(
      "Polling snapshot: searchAttempts=1, rawResultCount=1, " +
        "postSentAfterCandidateCount=1, invalidOrMissingTimestampCount=0, " +
        "fetchedMessageCount=0, extractionMissCount=0, excludedValueCount=0, " +
        "transientRequestErrorCount=1, transientRequestErrorStatuses=[503], " +
        "newestCandidateAgeMs=1000",
    );
  });

  it("reports messages that do not contain an extractable value", async () => {
    const mockClient: MailpitClient = {
      searchMessages: vi.fn<MailpitClient["searchMessages"]>(async () => [
        createSearchSummaryWithoutTimestamp({ id: "no-value" }),
      ]),
      getMessage: vi.fn<MailpitClient["getMessage"]>(async () =>
        createMessage({
          id: "no-value",
          text: "The expected value is absent.",
        }),
      ),
    };

    const actualPromise = fetchMagicLinkFromMailpit({
      client: mockClient,
      email: "user@example.test",
      ...createImmediateTimeout(),
    });

    await expect(actualPromise).rejects.toThrow(
      "Polling snapshot: searchAttempts=1, rawResultCount=1, " +
        "postSentAfterCandidateCount=1, invalidOrMissingTimestampCount=1, " +
        "fetchedMessageCount=1, extractionMissCount=1, excludedValueCount=0, " +
        "transientRequestErrorCount=0, transientRequestErrorStatuses=[], " +
        "newestCandidateAgeMs=unavailable",
    );
  });

  it("reports excluded values without exposing recipient PII or extracted secrets", async () => {
    const email = "sensitive-user@example.test";
    const excludedCode = "81027033";
    const sensitiveLink = "https://app.test/v2/email-login-link?credential=sensitive";
    const mockClient: MailpitClient = {
      searchMessages: vi.fn<MailpitClient["searchMessages"]>(async () => [
        createSearchSummary({ id: "excluded" }),
      ]),
      getMessage: vi.fn<MailpitClient["getMessage"]>(async () =>
        createMessage({
          id: "excluded",
          text: `${excludedCode} ${sensitiveLink}`,
        }),
      ),
    };

    const actualPromise = fetchEmailOtpCodeFromMailpit({
      client: mockClient,
      email,
      excludeCodes: [excludedCode],
      ...createImmediateTimeout(),
    });

    const actualError = await captureError({ promise: actualPromise });
    const actualErrorChain = getErrorChainMessage({ error: actualError });

    expect(actualError.message).toContain(
      "Polling snapshot: searchAttempts=1, rawResultCount=1, " +
        "postSentAfterCandidateCount=1, invalidOrMissingTimestampCount=0, " +
        "fetchedMessageCount=1, extractionMissCount=0, excludedValueCount=1, " +
        "transientRequestErrorCount=0, transientRequestErrorStatuses=[], " +
        "newestCandidateAgeMs=1000",
    );
    expect(actualErrorChain).not.toContain(email);
    expect(actualErrorChain).not.toContain(excludedCode);
    expect(actualErrorChain).not.toContain(sensitiveLink);
  });

  it("does not retain sensitive details from transient Mailpit request errors", async () => {
    const email = "sensitive-user@example.test";
    const secret = "sensitive-upstream-detail";
    const mockClient: MailpitClient = {
      searchMessages: vi.fn<MailpitClient["searchMessages"]>(async () => {
        throw new MailpitRequestError({
          message: `Mailpit request failed for ${email}`,
          status: 503,
          cause: new Error(secret),
        });
      }),
      getMessage: vi.fn<MailpitClient["getMessage"]>(),
    };

    const actualPromise = fetchMagicLinkFromMailpit({
      client: mockClient,
      email,
      ...createImmediateTimeout(),
    });

    const actualError = await captureError({ promise: actualPromise });
    const actualErrorChain = getErrorChainMessage({ error: actualError });

    expect(actualError.message).toContain(
      "transientRequestErrorCount=1, transientRequestErrorStatuses=[503]",
    );
    expect(actualErrorChain).not.toContain(email);
    expect(actualErrorChain).not.toContain(secret);
  });
});

async function captureError(params: { promise: Promise<unknown> }): Promise<Error> {
  try {
    await params.promise;
  } catch (error: unknown) {
    if (error instanceof Error) {
      return error;
    }
  }

  throw new Error("Expected promise to reject with an Error");
}

function getErrorChainMessage(params: { error: Error }): string {
  const messages: string[] = [];
  let currentError: unknown = params.error;

  while (currentError instanceof Error) {
    messages.push(currentError.message);
    currentError = currentError.cause;
  }

  return messages.join(" | ");
}

function createImmediateTimeout(): {
  timeoutMs: number;
  pollIntervalMs: number;
  nowImplementation: () => number;
  sleepImplementation: (params: { durationMs: number }) => Promise<void>;
} {
  let currentTimeMs = Date.parse("2026-07-16T12:00:01.000Z");

  return {
    timeoutMs: 100,
    pollIntervalMs: 100,
    nowImplementation: () => currentTimeMs,
    sleepImplementation: async ({ durationMs }) => {
      currentTimeMs += durationMs;
    },
  };
}

function createMessage(params: {
  id: string;
  date?: string;
  html?: string;
  text?: string;
}): MailpitMessage {
  return {
    ID: params.id,
    From: { Address: "noreply@example.test", Name: "Clipboard" },
    To: [{ Address: "user@example.test", Name: "User" }],
    Subject: "Sign in",
    Date: params.date ?? "2026-07-16T12:00:00.000Z",
    Text: params.text ?? "",
    HTML: params.html ?? "",
  };
}

function createSearchSummary(params: { id: string; created?: string }): MailpitMessageSummary {
  return {
    ID: params.id,
    Created: params.created ?? "2026-07-16T12:00:00.000Z",
    From: { Address: "noreply@example.test", Name: "Clipboard" },
    To: [{ Address: "user@example.test", Name: "User" }],
    Subject: "Sign in",
  };
}

function createSearchSummaryWithoutTimestamp(params: { id: string }): MailpitMessageSummary {
  return {
    ID: params.id,
    From: { Address: "noreply@example.test", Name: "Clipboard" },
    To: [{ Address: "user@example.test", Name: "User" }],
    Subject: "Sign in",
  };
}
