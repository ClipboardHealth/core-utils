import {
  createMailpitClient,
  fetchEmailOtpCodeFromMailpit,
  fetchMagicLinkFromMailpit,
  type MailpitClient,
  type MailpitMessage,
  type MailpitMessageSummary,
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

    expect(actual).toEqual({ value: "81027033", messageId: "otp" });
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
});

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
