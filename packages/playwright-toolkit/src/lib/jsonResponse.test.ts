import { isNil } from "@clipboard-health/util-ts";
import { errors, type Page, type Response } from "@playwright/test";

import { waitForParsedJsonResponse } from "../index";

interface MockResponseParams {
  body: unknown;
  bodyError?: Error;
  method?: string;
  status?: number;
  url?: string;
}

interface MockResponse {
  response: Response;
  setReadable(isReadable: boolean): void;
}

interface Deferred<T> {
  promise: Promise<T>;
  reject(error: unknown): void;
  resolve(value: T): void;
}

interface VersionResponse {
  version: string;
}

const VERSION_TWO_RESPONSE = { version: "V2" };
const VERSION_THREE_RESPONSE = { version: "V3" };
const PARSED_VERSION_RESPONSES = new Map<unknown, VersionResponse>([
  [VERSION_THREE_RESPONSE, VERSION_THREE_RESPONSE],
]);

function parseVersionThreeCandidate(params: { body: unknown }): VersionResponse | undefined {
  return PARSED_VERSION_RESPONSES.get(params.body);
}

function createMockResponse(params: MockResponseParams): MockResponse {
  let isReadable = true;
  const response = {
    json: vi.fn(async () => {
      if (!isReadable) {
        throw new Error("Response body is no longer readable");
      }
      if (params.bodyError) {
        throw params.bodyError;
      }

      return await Promise.resolve(params.body);
    }),
    request: vi.fn(() => ({ method: vi.fn(() => params.method ?? "GET") })),
    status: vi.fn(() => params.status ?? 200),
    url: vi.fn(() => params.url ?? "https://api.example.test/workers"),
  } as unknown as Response;

  return {
    response,
    setReadable(nextIsReadable) {
      isReadable = nextIsReadable;
    },
  };
}

function createMockPage(params: {
  afterMatch?: () => void;
  exhaustionError?: Error;
  responses: Response[];
}): Page {
  return {
    waitForResponse: vi.fn(async (predicate: Parameters<Page["waitForResponse"]>[0]) => {
      if (typeof predicate !== "function") {
        throw new TypeError("Expected a response predicate");
      }

      for (const response of params.responses) {
        // eslint-disable-next-line no-await-in-loop -- Mock responses arrive in observed order.
        if (await predicate(response)) {
          params.afterMatch?.();
          return response;
        }
      }

      throw params.exhaustionError ?? new Error("Timeout waiting for response");
    }),
  } as unknown as Page;
}

function createOutOfOrderMockPage(params: {
  fastBody: Deferred<unknown>;
  fastResponse: Response;
  fastValue: unknown;
  slowBody: Deferred<unknown>;
  slowResponse: Response;
  slowValue: unknown;
}): Page {
  return {
    waitForResponse: vi.fn(async (predicate: Parameters<Page["waitForResponse"]>[0]) => {
      if (typeof predicate !== "function") {
        throw new TypeError("Expected a response predicate");
      }

      const slowMatchPromise = predicate(params.slowResponse);
      const fastMatchPromise = predicate(params.fastResponse);
      params.fastBody.resolve(params.fastValue);
      await fastMatchPromise;
      params.slowBody.resolve(params.slowValue);
      await slowMatchPromise;

      return params.fastResponse;
    }),
  } as unknown as Page;
}

function createDeferred<T>(): Deferred<T> {
  let rejectPromise: ((error: unknown) => void) | undefined;
  let resolvePromise: ((value: T) => void) | undefined;
  const promise = new Promise<T>((resolve, reject) => {
    rejectPromise = reject;
    resolvePromise = resolve;
  });

  return {
    promise,
    reject(error) {
      if (isNil(rejectPromise)) {
        throw new Error("Deferred promise was not initialized");
      }

      rejectPromise(error);
    },
    resolve(value) {
      if (isNil(resolvePromise)) {
        throw new Error("Deferred promise was not initialized");
      }

      resolvePromise(value);
    },
  };
}

describe("waitForParsedJsonResponse", () => {
  it("parses the matched body before the response lifetime ends", async () => {
    const mockResponse = createMockResponse({ body: VERSION_THREE_RESPONSE });
    const page = createMockPage({
      afterMatch: () => {
        mockResponse.setReadable(false);
      },
      responses: [mockResponse.response],
    });

    const actual = await waitForParsedJsonResponse<{ version: string }>({
      isCandidate: ({ response }) => response.url().endsWith("/workers"),
      page,
      parseCandidate: parseVersionThreeCandidate,
      timeoutMs: 1000,
    });

    expect(actual).toEqual({ version: "V3" });
    expect(mockResponse.response.json).toHaveBeenCalledTimes(1);
    expect(page.waitForResponse).toHaveBeenCalledWith(expect.any(Function), { timeout: 1000 });
  });

  it("continues after an exact response body loss and returns a later candidate", async () => {
    const firstBody = createDeferred<unknown>();
    const lostResponse = createMockResponse({ body: firstBody.promise });
    const freshResponse = createMockResponse({ body: VERSION_THREE_RESPONSE });
    const waitPromise = waitForParsedJsonResponse<{ version: string }>({
      isCandidate: () => true,
      page: createMockPage({ responses: [lostResponse.response, freshResponse.response] }),
      parseCandidate: parseVersionThreeCandidate,
      timeoutMs: 1000,
    });
    await vi.waitFor(() => {
      expect(lostResponse.response.json).toHaveBeenCalledTimes(1);
    });

    firstBody.reject(
      new Error(
        "response.json: Protocol error (Network.getResponseBody): No resource with given identifier found",
      ),
    );

    await expect(waitPromise).resolves.toEqual({ version: "V3" });
    expect(freshResponse.response.json).toHaveBeenCalledTimes(1);
  });

  it("propagates a response body loss from a different protocol method", async () => {
    const body = createDeferred<unknown>();
    const mockResponse = createMockResponse({ body: body.promise });
    const waitPromise = waitForParsedJsonResponse({
      isCandidate: () => true,
      page: createMockPage({ responses: [mockResponse.response] }),
      parseCandidate: parseVersionThreeCandidate,
      timeoutMs: 1000,
    });
    await vi.waitFor(() => {
      expect(mockResponse.response.json).toHaveBeenCalledTimes(1);
    });
    const error = new Error(
      "response.json: Protocol error (Network.getResponseBodyForInterception): No resource with given identifier found",
    );

    body.reject(error);

    await expect(waitPromise).rejects.toBe(error);
  });

  it("preserves the timeout cause with bounded redacted loss diagnostics", async () => {
    const bodyLossError = new Error(
      "response.json: Protocol error (Network.getResponseBody): No resource with given identifier found",
    );
    const sensitivePath =
      "/api/workplaces/workplace-secret/shift-invites/invite-secret/workers/worker-secret";
    const methods = ["GET", "POST", "PUT", "PATCH", "DELETE"];
    const responses = methods.map((method, index) =>
      createMockResponse({
        body: undefined,
        bodyError: bodyLossError,
        method,
        status: 200 + index,
        url: `https://api.example.test${sensitivePath}?token=secret-token`,
      }),
    );
    const timeoutError = new errors.TimeoutError("Timeout 1000ms exceeded.");
    let actualError: unknown;

    try {
      await waitForParsedJsonResponse({
        isCandidate: () => true,
        page: createMockPage({
          exhaustionError: timeoutError,
          responses: responses.map(({ response }) => response),
        }),
        parseCandidate: parseVersionThreeCandidate,
        timeoutMs: 1000,
      });
    } catch (error: unknown) {
      actualError = error;
    }

    expect(actualError).toMatchObject({
      cause: timeoutError,
      message: expect.stringContaining("count=5"),
    });
    expect(String(actualError)).toContain("method=GET status=200 path=/[redacted-path]");
    expect(String(actualError).match(/method=/g)).toHaveLength(3);
    expect(String(actualError)).not.toContain("workplace-secret");
    expect(String(actualError)).not.toContain("invite-secret");
    expect(String(actualError)).not.toContain("worker-secret");
    expect(String(actualError)).not.toContain("secret-token");
    expect(String(actualError).length).toBeLessThan(500);
  });

  it.each([
    ["invalid JSON", new SyntaxError("Unexpected token in JSON")],
    [
      "the CDP method without the loss message",
      new Error("response.json: Protocol error (Network.getResponseBody): Request failed"),
    ],
    [
      "the loss message without the CDP method",
      new Error("response.json: No resource with given identifier found"),
    ],
    ["an arbitrary protocol error", new Error("Protocol error (Runtime.callFunctionOn): Failed")],
    ["page closure", new Error("Target page, context or browser has been closed")],
    ["cancellation", new DOMException("This operation was aborted", "AbortError")],
  ])("propagates %s from the candidate body read", async (_name, bodyError) => {
    const mockResponse = createMockResponse({ body: undefined, bodyError });

    const actualPromise = waitForParsedJsonResponse({
      isCandidate: () => true,
      page: createMockPage({ responses: [mockResponse.response] }),
      parseCandidate: parseVersionThreeCandidate,
      timeoutMs: 1000,
    });

    await expect(actualPromise).rejects.toBe(bodyError);
  });

  it("propagates a page closure after a classified body loss", async () => {
    const pageClosedError = new Error("Target page, context or browser has been closed");
    const lostResponse = createMockResponse({
      body: undefined,
      bodyError: new Error(
        "response.json: Protocol error (Network.getResponseBody): No resource with given identifier found",
      ),
    });

    const actualPromise = waitForParsedJsonResponse({
      isCandidate: () => true,
      page: createMockPage({
        exhaustionError: pageClosedError,
        responses: [lostResponse.response],
      }),
      parseCandidate: parseVersionThreeCandidate,
      timeoutMs: 1000,
    });

    await expect(actualPromise).rejects.toBe(pageClosedError);
  });

  it("propagates the original timeout when no response body was lost", async () => {
    const timeoutError = new errors.TimeoutError("Timeout 1000ms exceeded.");

    const actualPromise = waitForParsedJsonResponse({
      isCandidate: () => false,
      page: createMockPage({ exhaustionError: timeoutError, responses: [] }),
      parseCandidate: parseVersionThreeCandidate,
      timeoutMs: 1000,
    });

    await expect(actualPromise).rejects.toBe(timeoutError);
  });

  it("accepts null as a parsed JSON response", async () => {
    const mockResponse = createMockResponse({ body: null });

    const actual = await waitForParsedJsonResponse<null>({
      isCandidate: () => true,
      page: createMockPage({ responses: [mockResponse.response] }),
      parseCandidate: () => null,
      timeoutMs: 1000,
    });

    expect(actual).toBeNull();
  });

  it("skips non-candidates and parsed values that are not a match", async () => {
    const unrelatedResponse = createMockResponse({
      body: VERSION_THREE_RESPONSE,
      url: "https://api.example.test/agreements",
    });
    const staleResponse = createMockResponse({ body: VERSION_TWO_RESPONSE });
    const freshResponse = createMockResponse({ body: VERSION_THREE_RESPONSE });

    const actual = await waitForParsedJsonResponse<{ version: string }>({
      isCandidate: ({ response }) => response.url().endsWith("/workers"),
      page: createMockPage({
        responses: [unrelatedResponse.response, staleResponse.response, freshResponse.response],
      }),
      parseCandidate: parseVersionThreeCandidate,
      timeoutMs: 1000,
    });

    expect(actual).toEqual({ version: "V3" });
    expect(unrelatedResponse.response.json).not.toHaveBeenCalled();
    expect(staleResponse.response.json).toHaveBeenCalledTimes(1);
    expect(freshResponse.response.json).toHaveBeenCalledTimes(1);
  });

  it("returns the value associated with the response selected during concurrent parsing", async () => {
    const slowBody = createDeferred<unknown>();
    const fastBody = createDeferred<unknown>();
    const slowValue = { version: "slow" };
    const fastValue = { version: "fast" };
    const slowResponse = createMockResponse({ body: slowBody.promise });
    const fastResponse = createMockResponse({ body: fastBody.promise });
    const parsedResponses = new Map<unknown, VersionResponse>([
      [slowValue, slowValue],
      [fastValue, fastValue],
    ]);
    const page = createOutOfOrderMockPage({
      fastBody,
      fastResponse: fastResponse.response,
      fastValue,
      slowBody,
      slowResponse: slowResponse.response,
      slowValue,
    });

    const actual = await waitForParsedJsonResponse({
      isCandidate: () => true,
      page,
      parseCandidate: ({ body }) => parsedResponses.get(body),
      timeoutMs: 1000,
    });

    expect(actual).toBe(fastValue);
  });

  it("surfaces parser failures", async () => {
    const mockResponse = createMockResponse({ body: { version: "invalid" } });

    await expect(
      waitForParsedJsonResponse({
        isCandidate: () => true,
        page: createMockPage({ responses: [mockResponse.response] }),
        parseCandidate: () => {
          throw new Error("Invalid worker response");
        },
        timeoutMs: 1000,
      }),
    ).rejects.toThrow("Invalid worker response");
  });
});
