import type { Page, Request, Response, TestInfo } from "@playwright/test";

import {
  type CognitoRequestLike,
  fillOtpAndWaitForCognitoRedirect,
  isCognitoOtpChallengeRequest,
  sanitizeCognitoDiagnosticText,
} from "../index";

describe("Cognito diagnostics", () => {
  it.each(["SMS_OTP", "EMAIL_OTP"])(
    "matches %s RespondToAuthChallenge requests",
    (challengeName) => {
      const input: CognitoRequestLike = {
        headers: () => ({
          "x-amz-target": "AWSCognitoIdentityProviderService.RespondToAuthChallenge",
        }),
        method: () => "POST",
        postDataJSON: () => ({ ChallengeName: challengeName }),
        url: () => "https://cognito-idp.us-west-2.amazonaws.com/",
      };

      expect(isCognitoOtpChallengeRequest({ request: input })).toBe(true);
    },
  );

  it("redacts OTPs, phone numbers, emails, sessions, and tokens", () => {
    const input =
      'user@example.test +14155551234 code=123456 "Session":"secret" Bearer abc.def.ghi';

    const actual = sanitizeCognitoDiagnosticText({ text: input });

    expect(actual).not.toContain("user@example.test");
    expect(actual).not.toContain("+14155551234");
    expect(actual).not.toContain("123456");
    expect(actual).not.toContain("secret");
    expect(actual).not.toContain("abc.def.ghi");
  });

  it("fills the OTP and returns the successful redirect URL", async () => {
    const mockFill = vi.fn<(value: string) => Promise<void>>().mockResolvedValue();
    const mockPage = createMockPage({
      fill: mockFill,
      waitForUrl: async () => {
        await Promise.resolve();
      },
    });

    const actual = await fillOtpAndWaitForCognitoRedirect({
      expectedUrl: /dashboard/,
      otp: "123456",
      page: mockPage,
    });

    expect(actual).toEqual({ redirectUrl: "https://app.example.test/dashboard" });
    expect(mockFill).toHaveBeenCalledWith("123456");
  });

  it("attaches sanitized Cognito response diagnostics when redirect fails", async () => {
    const listeners = new Map<string, (value: Request | Response) => Promise<void> | void>();
    const mockRequest = createMockPlaywrightRequest();
    const mockResponse = {
      request: () => mockRequest,
      status: () => 400,
      statusText: () => "Bad Request",
      text: async () =>
        await Promise.resolve(
          '{"message":"Invalid code for user@example.test","Session":"secret-session"}',
        ),
    } as unknown as Response;
    const mockAttach = vi
      .fn<(name: string, attachment: unknown) => Promise<void>>()
      .mockResolvedValue();
    const mockPage = createMockPage({
      listeners,
      waitForUrl: async () => {
        await getListener({ eventName: "response", listeners })(mockResponse);
        throw new Error("redirect timed out");
      },
    });

    const actualPromise = fillOtpAndWaitForCognitoRedirect({
      expectedUrl: /dashboard/,
      otp: "123456",
      page: mockPage,
      testInfo: { attach: mockAttach } as unknown as TestInfo,
    });

    await expect(actualPromise).rejects.toThrow("status=400 Bad Request");
    await expect(actualPromise).rejects.not.toThrow("secret-session");
    expect(mockAttach).toHaveBeenCalledWith(
      "cognito-otp-diagnostics",
      expect.objectContaining({ contentType: "image/png" }),
    );
  });

  it("redacts the final redirect error, URL path, and retained cause", async () => {
    const sensitiveEmail = "sensitive-user@example.test";
    const mockPage = createMockPage({
      url: `https://app.example.test/login/${sensitiveEmail}?token=secret-token`,
      waitForUrl: async () => {
        throw new Error(`redirect failed for ${sensitiveEmail} with code 123456`);
      },
    });
    let actualError: unknown;

    try {
      await fillOtpAndWaitForCognitoRedirect({
        expectedUrl: `https://app.example.test/dashboard/${sensitiveEmail}`,
        otp: "123456",
        page: mockPage,
        expectedUrlTimeoutMs: 10,
      });
    } catch (error: unknown) {
      actualError = error;
    }

    expect(actualError).toBeInstanceOf(Error);
    expect(String(actualError)).not.toContain(sensitiveEmail);
    expect(String(actualError)).not.toContain("123456");
    expect(actualError).toMatchObject({ cause: expect.any(Error) });
    expect(String((actualError as Error).cause)).not.toContain(sensitiveEmail);
    expect(String((actualError as Error).cause)).not.toContain("123456");
  });
});

function createMockPage(params: {
  fill?: (value: string) => Promise<void> | void;
  listeners?: Map<string, (value: Request | Response) => Promise<void> | void>;
  url?: string;
  waitForUrl: () => Promise<void>;
}): Page {
  const listeners = params.listeners ?? new Map();

  return {
    evaluate: vi.fn<() => Promise<void>>(async () => {
      await Promise.resolve();
    }),
    getByLabel: vi.fn<() => { fill: (value: string) => Promise<void> | void }>(() => ({
      fill: params.fill ?? vi.fn<(value: string) => void>(),
    })),
    locator: vi.fn<() => { textContent: () => Promise<string> }>(() => ({
      textContent: vi.fn<() => Promise<string>>(
        async () => await Promise.resolve("Code invalid for user@example.test"),
      ),
    })),
    off: vi.fn<(eventName: string) => void>((eventName) => {
      listeners.delete(eventName);
    }),
    on: vi.fn<
      (eventName: string, listener: (value: Request | Response) => Promise<void> | void) => void
    >((eventName, listener) => {
      listeners.set(eventName, listener);
    }),
    screenshot: vi.fn<() => Promise<Buffer>>(
      async () => await Promise.resolve(Buffer.from("screenshot")),
    ),
    url: vi.fn<() => string>(() => params.url ?? "https://app.example.test/dashboard"),
    waitForURL: vi.fn<() => Promise<void>>(params.waitForUrl),
  } as unknown as Page;
}

function createMockPlaywrightRequest(): Request {
  return {
    failure: vi.fn<() => null>(() => null),
    headers: vi.fn<() => Record<string, string>>(() => ({
      "x-amz-target": "AWSCognitoIdentityProviderService.RespondToAuthChallenge",
    })),
    method: vi.fn<() => string>(() => "POST"),
    postDataJSON: vi.fn<() => unknown>(() => ({
      ChallengeName: "SMS_OTP",
      Session: "secret-session",
    })),
    url: vi.fn<() => string>(() => "https://cognito-idp.us-west-2.amazonaws.com/?token=secret"),
  } as unknown as Request;
}

function getListener(params: {
  eventName: string;
  listeners: Map<string, (value: Request | Response) => Promise<void> | void>;
}): (value: Request | Response) => Promise<void> | void {
  const listener = params.listeners.get(params.eventName);

  if (listener === undefined) {
    throw new Error(`Missing listener for ${params.eventName}`);
  }

  return listener;
}
