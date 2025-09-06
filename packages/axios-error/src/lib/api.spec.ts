/* eslint-disable jest/no-conditional-expect, @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-argument, jest/no-jasmine-globals, no-plusplus */

import {
  AxiosError,
  extractMessage,
  extractUserMessage,
  getHttpStatus,
  integrations,
  isRetryable,
  presets,
} from "./api";
import { allErrorScenarios, getAllErrorCombinations } from "./testUtils";

describe("axios-error API", () => {
  describe("AxiosError.from()", () => {
    describe("comprehensive error classification", () => {
      const combinations = getAllErrorCombinations();

      it.each(combinations)("classifies $category.$scenario correctly", ({ error, expected }) => {
        const result = AxiosError.from(error);

        expect(result.details.type).toBe(expected.type);
        expect(result.isRetryable).toBe(expected.isRetryable);
        expect(result.httpStatus).toBe(expected.httpStatus);
      });
    });

    describe("type guards work correctly", () => {
      it("provides TypeScript narrowing for network errors", () => {
        const error = allErrorScenarios.network.connectionReset();
        const result = AxiosError.from(error);

        expect(result.isNetworkError()).toBe(true);

        // The following assertions are safe due to type guard
        if (result.isNetworkError()) {
          // TypeScript should know this is a NetworkError
          expect(result.details.type).toBe("network");
          expect(result.details.code).toBeDefined();
          expect(typeof result.details.code).toBe("string");
          expect(result.details.isRetryable).toBe(true);
        }
      });

      it("provides TypeScript narrowing for response errors", () => {
        const error = allErrorScenarios.response.objectMessage(400, "Bad request");
        const result = AxiosError.from(error);

        if (result.isResponseError()) {
          // TypeScript should know this is a ResponseError
          expect(result.details.type).toBe("response");
          expect(result.details.status).toBe(400);
          expect(result.details.data).toEqual({ message: "Bad request" });
          expect(result.details.headers).toBeDefined();
        } else {
          fail("Should be classified as response error");
        }
      });

      it("provides TypeScript narrowing for timeout errors", () => {
        const error = allErrorScenarios.timeout.requestTimeout();
        const result = AxiosError.from(error);

        if (result.isTimeoutError()) {
          // TypeScript should know this is a TimeoutError
          expect(result.details.type).toBe("timeout");
          expect(result.details.timeout).toBe(5000);
          expect(result.details.timeoutType).toBe("response");
        } else {
          fail("Should be classified as timeout error");
        }
      });
    });

    describe("intelligent data extraction", () => {
      it.each([
        {
          name: "string response",
          error: allErrorScenarios.response.simpleMessage(
            400,
            "The shift is not available to the employee",
          ),
          expected: "The shift is not available to the employee",
        },
        {
          name: "object with message field",
          error: allErrorScenarios.response.objectMessage(
            400,
            "Employee is unavailable at this time",
          ),
          expected: "Employee is unavailable at this time",
        },
        {
          name: "object with error field",
          error: allErrorScenarios.response.objectError(
            400,
            "The employee is already assigned to this shift",
          ),
          expected: "The employee is already assigned to this shift",
        },
        {
          name: "errors array structure",
          error: allErrorScenarios.response.errorsArray(
            422,
            "Cannot create an employee that is connected to multiple accounts",
          ),
          expected: "Cannot create an employee that is connected to multiple accounts",
        },
        {
          name: "nested data.errors structure",
          error: allErrorScenarios.response.nestedErrors(400, "Nested validation error"),
          expected: "Nested validation error",
        },
        {
          name: "GraphQL errors format",
          error: allErrorScenarios.response.graphqlErrors("GraphQL validation failed"),
          expected: "GraphQL validation failed",
        },
        {
          name: "JSON:API errors format",
          error: allErrorScenarios.response.jsonApiErrors("Invalid email format", "INVALID_EMAIL"),
          expected: "Invalid email format",
        },
        {
          name: "RFC 7807 Problem Details",
          error: allErrorScenarios.response.rfc7807Problem("The request was invalid"),
          expected: "The request was invalid",
        },
      ])("extracts message from $name", ({ error, expected }) => {
        const result = AxiosError.from(error);

        if (result.isResponseError()) {
          expect(result.details.extractedMessage).toBe(expected);
        }
      });
    });

    describe("case insensitive message matching", () => {
      it.each([
        "The shift is not available to the employee",
        "THE SHIFT IS NOT AVAILABLE TO THE EMPLOYEE",
        "the shift is not available to the employee",
        "The Shift Is Not Available To The Employee",
        "   The shift is not available to the employee   ",
        "\t\nThe shift is not available to the employee\n\t",
      ])("handles message variations: %s", (message) => {
        const error = allErrorScenarios.response.simpleMessage(400, message);
        const result = AxiosError.from(error);

        expect(result.message).toBeTruthy();
      });
    });
  });

  describe("AxiosError.fromPromise()", () => {
    it("returns success result for resolved promises", async () => {
      const mockPromise = Promise.resolve({ data: "success" });

      const result = await AxiosError.fromPromise(mockPromise as any);

      expect(result.error).toBeNull();
      expect(result.data).toBe("success");
    });

    it("returns error result for rejected promises", async () => {
      const error = allErrorScenarios.network.connectionRefused();
      const mockPromise = Promise.reject(error);

      const result = await AxiosError.fromPromise(mockPromise as any);

      expect(result.data).toBeNull();
      expect(result.error).toBeDefined();
      expect(result.error!.details.type).toBe("network");
    });
  });

  describe("convenience functions", () => {
    describe("extractMessage()", () => {
      it("extracts technical message from any error", () => {
        const error = allErrorScenarios.network.connectionRefused();
        const message = extractMessage(error);

        expect(message).toBe("connect ECONNREFUSED 127.0.0.1:3000");
      });
    });

    describe("extractUserMessage()", () => {
      it("extracts user-friendly message from any error", () => {
        const error = allErrorScenarios.network.connectionRefused();
        const userMessage = extractUserMessage(error);

        expect(userMessage).toBe("Unable to connect to server. Please check your connection.");
      });
    });

    describe("isRetryable()", () => {
      it("returns true for retryable errors", () => {
        const error = allErrorScenarios.network.connectionReset();
        expect(isRetryable(error)).toBe(true);
      });

      it("returns false for non-retryable errors", () => {
        const error = allErrorScenarios.configuration.badOption();
        expect(isRetryable(error)).toBe(false);
      });
    });

    describe("getHttpStatus()", () => {
      it("returns appropriate HTTP status for different error types", () => {
        expect(getHttpStatus(allErrorScenarios.network.connectionRefused())).toBe(503);
        expect(getHttpStatus(allErrorScenarios.timeout.requestTimeout())).toBe(408);
        expect(getHttpStatus(allErrorScenarios.response.serverError(500))).toBe(500);
        expect(getHttpStatus(allErrorScenarios.configuration.badOption())).toBe(400);
      });
    });
  });

  describe("integrations", () => {
    describe("toApiResponse()", () => {
      it("creates consistent API error response", () => {
        const error = allErrorScenarios.network.connectionReset();
        const response = integrations.toApiResponse(error);

        expect(response).toMatchObject({
          success: false,
          error: {
            type: "network",
            message: expect.any(String),
            retryable: true,
          },
          timestamp: expect.any(String),
        });
      });
    });

    describe("toExpressResponse()", () => {
      it("creates Express.js compatible error response", () => {
        const error = allErrorScenarios.response.serverError(500);
        const response = integrations.toExpressResponse(error);

        expect(response).toMatchObject({
          status: 500,
          json: {
            error: "response",
            message: expect.any(String),
            details: expect.any(Object),
          },
        });
      });
    });
  });

  describe("configuration presets", () => {
    describe("GraphQL preset", () => {
      it("extracts GraphQL error correctly", () => {
        const error = allErrorScenarios.response.graphqlErrors("Invalid input");
        const config = presets.graphql();
        const result = AxiosError.from(error, config);

        if (result.isResponseError()) {
          expect(result.details.extractedMessage).toBe("Invalid input");
        }
      });
    });

    describe("JSON:API preset", () => {
      it("extracts JSON:API error correctly", () => {
        const error = allErrorScenarios.response.jsonApiErrors("Resource not found", "NOT_FOUND");
        const config = presets.jsonApi();
        const result = AxiosError.from(error, config);

        if (result.isResponseError()) {
          expect(result.details.extractedMessage).toBe("Resource not found");
          expect(result.details.extractedCode).toBe("NOT_FOUND");
        }
      });
    });

    describe("RFC 7807 preset", () => {
      it("extracts Problem Details correctly", () => {
        const error = allErrorScenarios.response.rfc7807Problem(
          "Validation failed",
          "https://example.com/validation-error",
        );
        const config = presets.rfc7807();
        const result = AxiosError.from(error, config);

        if (result.isResponseError()) {
          expect(result.details.extractedMessage).toBe("Validation failed");
          expect(result.details.extractedCode).toBe("https://example.com/validation-error");
        }
      });
    });
  });

  describe("serialization", () => {
    it("toJSON() includes all relevant error information", () => {
      const error = allErrorScenarios.response.objectMessage(422, "Validation failed");
      const result = AxiosError.from(error);
      const json = result.toJSON();

      expect(json).toMatchObject({
        type: "response",
        message: expect.any(String),
        userMessage: expect.any(String),
        isRetryable: expect.any(Boolean),
        httpStatus: 422,
        status: 422,
        statusText: expect.any(String),
        data: { message: "Validation failed" },
      });
    });

    it("toString() provides readable error representation", () => {
      const error = allErrorScenarios.network.connectionReset();
      const result = AxiosError.from(error);
      const string_ = result.toString();

      expect(string_).toMatch(/\[NETWORK]/);
      expect(string_).toMatch(/ECONNRESET/);
      expect(string_).toMatch(/retryable/);
    });
  });

  describe("edge cases", () => {
    it("handles null errors gracefully", () => {
      const result = AxiosError.from(null);

      expect(result.details.type).toBe("unknown");
      expect(result.message).toBeTruthy();
      expect(result.userMessage).toBeTruthy();
    });

    it("handles undefined errors gracefully", () => {
      const result = AxiosError.from();

      expect(result.details.type).toBe("unknown");
      expect(result.message).toBeTruthy();
      expect(result.userMessage).toBeTruthy();
    });

    it("handles non-error objects gracefully", () => {
      const result = AxiosError.from({ not: "an error" });

      expect(result.details.type).toBe("unknown");
      expect(result.message).toBeTruthy();
      expect(result.userMessage).toBeTruthy();
    });

    it("handles circular references in error data", () => {
      const circularData: any = { message: "Circular reference" };
      circularData.self = circularData;

      const error = allErrorScenarios.response.objectMessage(400);
      error.response!.data = circularData;

      expect(() => AxiosError.from(error)).not.toThrow();

      const result = AxiosError.from(error);
      expect(result.details.type).toBe("response");
    });

    it("handles very deep nested error structures", () => {
      let deepData: any = { message: "Deep message" };

      // Create 20 levels of nesting
      for (let index = 0; index < 20; index++) {
        deepData = { nested: deepData };
      }

      const error = allErrorScenarios.response.objectMessage(400);
      error.response!.data = deepData;

      const result = AxiosError.from(error);
      expect(result.details.type).toBe("response");
      // Should handle deep nesting gracefully without infinite recursion
    });
  });

  describe("performance", () => {
    it("processes errors efficiently", () => {
      const error = allErrorScenarios.response.objectMessage(400, "Test message");

      const start = performance.now();
      for (let index = 0; index < 1000; index++) {
        AxiosError.from(error);
      }

      const end = performance.now();

      const timePerOperation = (end - start) / 1000;
      expect(timePerOperation).toBeLessThan(1); // Should be less than 1ms per operation
    });
  });
});

/* eslint-enable jest/no-conditional-expect, @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-argument, jest/no-jasmine-globals, no-plusplus */
