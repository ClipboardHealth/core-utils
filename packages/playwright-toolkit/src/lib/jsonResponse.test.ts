import type { Page, Response } from "@playwright/test";

import { waitForParsedJsonResponse } from "../index";

interface MockResponseParams {
  body: unknown;
  isReadable?: boolean;
  url?: string;
}

interface MockResponse {
  response: Response;
  setReadable(isReadable: boolean): void;
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
  let isReadable = params.isReadable ?? true;
  const response = {
    json: vi.fn(async () => {
      if (!isReadable) {
        throw new Error("Response body is no longer readable");
      }

      return await Promise.resolve(params.body);
    }),
    url: vi.fn(() => params.url ?? "https://api.example.test/workers"),
  } as unknown as Response;

  return {
    response,
    setReadable(nextIsReadable) {
      isReadable = nextIsReadable;
    },
  };
}

function createMockPage(params: { afterMatch?: () => void; responses: Response[] }): Page {
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

      throw new Error("Timeout waiting for response");
    }),
  } as unknown as Page;
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

  it("fails if Playwright returns without capturing a parsed body", async () => {
    const mockResponse = createMockResponse({ body: { version: "V3" } });
    const page = {
      waitForResponse: vi.fn(async () => await Promise.resolve(mockResponse.response)),
    } as unknown as Page;

    await expect(
      waitForParsedJsonResponse({
        isCandidate: () => true,
        page,
        parseCandidate: ({ body }) => body,
        timeoutMs: 321,
      }),
    ).rejects.toThrow(
      "Expected the matched JSON response body to be captured while it was readable.",
    );
    expect(page.waitForResponse).toHaveBeenCalledWith(expect.any(Function), { timeout: 321 });
  });
});
