/* eslint-disable jest/no-conditional-expect, @typescript-eslint/no-unnecessary-type-assertion, @typescript-eslint/no-explicit-any, no-plusplus, @typescript-eslint/no-confusing-void-expression */

import { classifyAxiosError } from "./classifier";
import { allErrorScenarios } from "./testUtils";

describe("classifyAxiosError", () => {
  describe("network error classification", () => {
    it.each([
      ["ECONNREFUSED", allErrorScenarios.network.connectionRefused()],
      ["ENOTFOUND", allErrorScenarios.network.dnsNotFound()],
      ["ECONNRESET", allErrorScenarios.network.connectionReset()],
      ["ERR_NETWORK", allErrorScenarios.network.networkError()],
      ["EHOSTUNREACH", allErrorScenarios.network.hostUnreachable()],
      ["ENETDOWN", allErrorScenarios.network.networkDown()],
    ])("classifies %s as network error correctly", (code, error) => {
      const result = classifyAxiosError(error);

      expect(result.type).toBe("network");
      expect(result.code).toBe(code);

      // Check retryability based on error code
      const nonRetryableCodes = ["ECONNREFUSED"];
      const expectedRetryable = !nonRetryableCodes.includes(code as string);
      expect(result.isRetryable).toBe(expectedRetryable);

      expect(result.userMessage).toContain("connect");
    });

    it("provides appropriate retry recommendations", () => {
      const retryableError = allErrorScenarios.network.connectionReset();
      const nonRetryableError = allErrorScenarios.network.connectionRefused();

      expect(classifyAxiosError(retryableError).isRetryable).toBe(true);
      expect(classifyAxiosError(nonRetryableError).isRetryable).toBe(false);
    });
  });

  describe("timeout error classification", () => {
    it.each([
      ["request timeout", allErrorScenarios.timeout.requestTimeout()],
      ["connection timeout", allErrorScenarios.timeout.connectionTimeout()],
      ["response timeout", allErrorScenarios.timeout.responseTimeout()],
    ])("classifies %s correctly", (type, error) => {
      const result = classifyAxiosError(error);

      expect(result.type).toBe("timeout");
      expect(result.isRetryable).toBe(true);
      expect(result.userMessage).toContain("timed out");
    });

    it("detects timeout type correctly", () => {
      const requestTimeout = classifyAxiosError(allErrorScenarios.timeout.requestTimeout());
      const connectionTimeout = classifyAxiosError(allErrorScenarios.timeout.connectionTimeout());

      expect(requestTimeout.type).toBe("timeout");
      expect(connectionTimeout.type).toBe("timeout");

      if (requestTimeout.type === "timeout") {
        expect(requestTimeout.timeoutType).toBe("response");
        expect(requestTimeout.timeout).toBe(5000);
      }
    });
  });

  describe("response error classification", () => {
    it.each([
      [400, false],
      [401, false],
      [403, false],
      [404, false],
      [408, true], // Request Timeout
      [422, false],
      [429, true], // Too Many Requests
      [500, true],
      [502, true],
      [503, true],
    ])("classifies HTTP %d with correct retry flag: %s", (status, expectedRetryable) => {
      const error = allErrorScenarios.response.simpleMessage(status);
      const result = classifyAxiosError(error);

      expect(result.type).toBe("response");
      expect(result.isRetryable).toBe(expectedRetryable);

      if (result.type === "response") {
        expect(result.status).toBe(status);
      }
    });

    it("generates appropriate user messages for common status codes", () => {
      const test404 = classifyAxiosError(allErrorScenarios.response.simpleMessage(404));
      const test401 = classifyAxiosError(allErrorScenarios.response.simpleMessage(401));
      const test500 = classifyAxiosError(allErrorScenarios.response.simpleMessage(500));

      expect(test404.userMessage).toContain("not found");
      expect(test401.userMessage).toContain("Authentication");
      expect(test500.userMessage).toContain("Server error");
    });

    it("preserves response headers correctly", () => {
      const error = allErrorScenarios.response.objectMessage(400);
      error.response!.headers = { "x-request-id": "123", "content-type": "application/json" };

      const result = classifyAxiosError(error);

      if (result.type === "response") {
        expect(result.headers).toEqual({
          "x-request-id": "123",
          "content-type": "application/json",
        });
      }
    });
  });

  describe("configuration error classification", () => {
    it.each([
      ["ERR_BAD_OPTION", allErrorScenarios.configuration.badOption()],
      ["ERR_BAD_OPTION_VALUE", allErrorScenarios.configuration.badOptionValue()],
      ["ERR_INVALID_URL", allErrorScenarios.configuration.invalidUrl()],
      ["ERR_BAD_REQUEST", allErrorScenarios.configuration.badRequest()],
    ])("classifies %s as configuration error", (code, error) => {
      const result = classifyAxiosError(error);

      expect(result.type).toBe("configuration");
      expect(result.isRetryable).toBe(false);
      expect(result.userMessage).toContain("configuration");
    });

    it("extracts configuration field when possible", () => {
      const urlError = allErrorScenarios.configuration.invalidUrl();
      const result = classifyAxiosError(urlError);

      if (result.type === "configuration") {
        expect(result.configField).toBe("url");
      }
    });
  });

  describe("abort error classification", () => {
    it.each([
      ["ERR_CANCELED", allErrorScenarios.abort.canceled()],
      ["user aborted", allErrorScenarios.abort.userAborted("User clicked cancel")],
    ])("classifies %s as abort error", (type, error) => {
      const result = classifyAxiosError(error);

      expect(result.type).toBe("abort");
      expect(result.isRetryable).toBe(false);
      expect(result.userMessage).toContain("cancelled");
    });

    it("extracts abort reason when available", () => {
      const userAborted = allErrorScenarios.abort.userAborted("User navigated away");
      const result = classifyAxiosError(userAborted);

      if (result.type === "abort") {
        expect(result.reason).toBeDefined();
      }
    });
  });

  describe("parse error classification", () => {
    it.each([
      ["JSON parse", allErrorScenarios.parse.jsonParse()],
      ["invalid JSON", allErrorScenarios.parse.invalidJson()],
      ["XML parse", allErrorScenarios.parse.xmlParse()],
    ])("classifies %s as parse error", (type, error) => {
      const result = classifyAxiosError(error);

      expect(result.type).toBe("parse");
      expect(result.isRetryable).toBe(false);
      expect(result.userMessage).toContain("invalid data");
    });

    it("detects parse type correctly", () => {
      const jsonError = classifyAxiosError(allErrorScenarios.parse.jsonParse());
      const xmlError = classifyAxiosError(allErrorScenarios.parse.xmlParse());

      if (jsonError.type === "parse") {
        expect(jsonError.parseType).toBe("json");
      }

      if (xmlError.type === "parse") {
        expect(xmlError.parseType).toBe("xml"); // XML is detected from message containing 'xml'
      }
    });
  });

  describe("unknown error classification", () => {
    it.each([
      ["non-axios Error", allErrorScenarios.unknown.nonAxiosError()],
      ["null", allErrorScenarios.unknown.nullError()],
      ["undefined", allErrorScenarios.unknown.undefinedError()],
      ["string", allErrorScenarios.unknown.stringError()],
      ["number", allErrorScenarios.unknown.numberError()],
    ])("classifies %s as unknown error", (type, error) => {
      const result = classifyAxiosError(error);

      expect(result.type).toBe("unknown");
      expect(result.isRetryable).toBe(true); // Conservative default
      expect(result.userMessage).toContain("unexpected error");
    });

    it("handles weird axios errors gracefully", () => {
      const weirdError = allErrorScenarios.unknown.weirdAxiosError();
      const result = classifyAxiosError(weirdError);

      expect(result.type).toBe("unknown");
      expect(result.message).toBe("Something very unusual happened");
    });
  });

  describe("edge cases and robustness", () => {
    it("handles axios errors missing expected properties", () => {
      const incompleteError: any = {
        isAxiosError: true,
        message: "Incomplete error",
        // Missing code, response, etc.
      };

      const result = classifyAxiosError(incompleteError);

      expect(result.type).toBe("unknown");
      expect(result.message).toBe("Incomplete error");
    });

    it("handles axios errors with unexpected property types", () => {
      const weirdError: any = {
        isAxiosError: true,
        message: "Weird error",
        code: 123, // Number instead of string
        response: "not an object", // String instead of object
      };

      expect(() => classifyAxiosError(weirdError)).not.toThrow();

      const result = classifyAxiosError(weirdError);
      expect(result.type).toBeTruthy();
    });

    it("preserves original error in all classifications", () => {
      const originalError = allErrorScenarios.network.connectionRefused();
      const result = classifyAxiosError(originalError);

      expect(result.originalError).toBe(originalError);
    });

    it("handles classification priority correctly", () => {
      // Create an error that could match multiple categories
      const ambiguousError: any = {
        isAxiosError: true,
        message: "Request canceled due to timeout",
        code: "ERR_CANCELED", // Could be abort
        response: undefined, // Could be network
      };

      const result = classifyAxiosError(ambiguousError);

      // Should prioritize abort over other classifications
      expect(result.type).toBe("abort");
    });

    it("handles malformed response objects", () => {
      const malformedError: any = {
        isAxiosError: true,
        message: "Request failed",
        response: {
          // Missing required properties like status, data
          headers: null,
        },
      };

      expect(() => classifyAxiosError(malformedError)).not.toThrow();

      const result = classifyAxiosError(malformedError);
      expect(result.type).toBe("response");

      if (result.type === "response") {
        expect(result.headers).toEqual({}); // Should default to empty object
      }
    });
  });

  describe("performance and memory", () => {
    it("does not modify the original error object", () => {
      const originalError = allErrorScenarios.response.objectMessage(400, "Test");
      const originalMessage = originalError.message;
      const originalCode = originalError.code;
      const originalResponse = originalError.response;

      classifyAxiosError(originalError);

      // Check that the important properties are unchanged
      expect(originalError.message).toBe(originalMessage);
      expect(originalError.code).toBe(originalCode);
      expect(originalError.response).toBe(originalResponse);
      expect(originalError.isAxiosError).toBe(true);
    });

    it("handles large error objects efficiently", () => {
      const largeData = { message: "Large error" };
      // Add many properties to simulate large response
      for (let index = 0; index < 1000; index++) {
        (largeData as any)[`field${index}`] = `value${index}`;
      }

      const largeError = allErrorScenarios.response.objectMessage(400);
      largeError.response!.data = largeData;

      const start = performance.now();
      const result = classifyAxiosError(largeError);
      const end = performance.now();

      expect(end - start).toBeLessThan(10); // Should be fast even with large data
      expect(result.type).toBe("response");
    });
  });
});

/* eslint-enable jest/no-conditional-expect, @typescript-eslint/no-unnecessary-type-assertion, @typescript-eslint/no-explicit-any, no-plusplus, @typescript-eslint/no-confusing-void-expression */
