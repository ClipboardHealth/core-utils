/* eslint-disable unicorn/consistent-function-scoping, @typescript-eslint/no-explicit-any, max-nested-callbacks, no-plusplus */

import { builtInCodeExtractors, builtInMessageExtractors, extractErrorData } from "./extractor";
import { allErrorScenarios } from "./testUtils";
import { type ResponseError } from "./types";

describe("extractErrorData", () => {
  function createResponseError(data: unknown): ResponseError {
    return {
      type: "response",
      status: 400,
      statusText: "Bad Request",
      data,
      message: "Request failed",
      userMessage: "Request failed",
      headers: {},
      isRetryable: false,
      originalError: allErrorScenarios.response.simpleMessage(400, "Test"),
    };
  }

  describe("message extraction", () => {
    describe("standard patterns", () => {
      it.each([
        // String responses
        { name: "simple string", data: "Error message", expected: "Error message" },
        { name: "string with whitespace", data: "   Error message   ", expected: "Error message" },
        { name: "empty string", data: "", expected: undefined },

        // Object with message field
        { name: "object.message", data: { message: "Object error" }, expected: "Object error" },
        {
          name: "object.message with whitespace",
          data: { message: "  Object error  " },
          expected: "Object error",
        },

        // Object with error field
        { name: "object.error string", data: { error: "Error string" }, expected: "Error string" },
        {
          name: "object.error object",
          data: { error: { message: "Nested error" } },
          expected: "Nested error",
        },

        // GraphQL errors array
        {
          name: "GraphQL errors",
          data: { errors: [{ message: "GraphQL error" }] },
          expected: "GraphQL error",
        },
        {
          name: "GraphQL multiple errors",
          data: { errors: [{ message: "First error" }, { message: "Second error" }] },
          expected: "First error",
        },

        // Nested data.errors
        {
          name: "nested data.errors",
          data: { data: { errors: [{ message: "Nested error" }] } },
          expected: "Nested error",
        },

        // Django REST framework detail
        { name: "detail field", data: { detail: "Detail message" }, expected: "Detail message" },

        // Details array
        {
          name: "details array string",
          data: { details: ["First detail"] },
          expected: "First detail",
        },
        {
          name: "details array object",
          data: { details: [{ message: "Detail message" }] },
          expected: "Detail message",
        },

        // JSON:API errors
        {
          name: "JSON:API detail",
          data: { errors: [{ detail: "JSON:API detail" }] },
          expected: "JSON:API detail",
        },
        {
          name: "JSON:API title",
          data: { errors: [{ title: "JSON:API title" }] },
          expected: "JSON:API title",
        },

        // Validation errors
        {
          name: "validation errors",
          data: { errors: { email: ["Email is required"] } },
          expected: "email: Email is required",
        },
        {
          name: "validation errors string",
          data: { errors: { password: "Password too short" } },
          expected: "password: Password too short",
        },

        // Other patterns
        { name: "statusText", data: { statusText: "Unauthorized" }, expected: "Unauthorized" },
        { name: "title field", data: { title: "Error title" }, expected: "Error title" },
      ])("extracts message from $name", ({ data, expected }) => {
        const responseError = createResponseError(data);
        const result = extractErrorData(responseError);

        expect(result.extractedMessage).toBe(expected);
      });
    });

    describe("complex nested structures", () => {
      it("handles deeply nested error messages", () => {
        const deepData = {
          level1: {
            level2: {
              level3: {
                message: "Deep message",
              },
            },
          },
        };

        const responseError = createResponseError(deepData);
        const result = extractErrorData(responseError);

        expect(result.extractedMessage).toBe("Deep message");
      });

      it("respects maxDepth configuration", () => {
        const deepData = {
          level1: {
            level2: {
              level3: {
                level4: {
                  level5: {
                    message: "Very deep message",
                  },
                },
              },
            },
          },
        };

        const responseError = createResponseError(deepData);
        const result = extractErrorData(responseError, { maxDepth: 3 });

        // Should not find message beyond maxDepth
        expect(result.extractedMessage).toBeUndefined();
      });

      it("handles circular references gracefully", () => {
        const circularData: any = { message: "Circular message" };
        circularData.self = circularData;

        const responseError = createResponseError(circularData);

        expect(() => extractErrorData(responseError)).not.toThrow();

        const result = extractErrorData(responseError);
        expect(result.extractedMessage).toBe("Circular message");
      });
    });

    describe("custom extractors", () => {
      it("uses custom message extractors first", () => {
        const customExtractor = jest.fn().mockReturnValue("Custom message");

        const responseError = createResponseError({ message: "Standard message" });
        const result = extractErrorData(responseError, {
          messageExtractors: [customExtractor],
        });

        expect(customExtractor).toHaveBeenCalled();
        expect(result.extractedMessage).toBe("Custom message");
      });

      it("falls back to standard patterns if custom extractors fail", () => {
        const failingExtractor = jest.fn().mockImplementation(() => {
          throw new Error("Extractor failed");
        });

        const responseError = createResponseError({ message: "Fallback message" });
        const result = extractErrorData(responseError, {
          messageExtractors: [failingExtractor],
        });

        expect(result.extractedMessage).toBe("Fallback message");
      });

      it("tries multiple custom extractors in order", () => {
        const extractor1 = jest.fn().mockReturnValue();
        const extractor2 = jest.fn().mockReturnValue("Second extractor");
        const extractor3 = jest.fn().mockReturnValue("Third extractor");

        const responseError = createResponseError({ data: "test" });
        const result = extractErrorData(responseError, {
          messageExtractors: [extractor1, extractor2, extractor3],
        });

        expect(extractor1).toHaveBeenCalled();
        expect(extractor2).toHaveBeenCalled();
        expect(extractor3).not.toHaveBeenCalled(); // Should stop at first success
        expect(result.extractedMessage).toBe("Second extractor");
      });
    });
  });

  describe("code extraction", () => {
    it.each([
      { name: "direct code string", data: { code: "ERROR_CODE" }, expected: "ERROR_CODE" },
      { name: "direct code number", data: { code: 1001 }, expected: 1001 },
      {
        name: "errorCode field",
        data: { errorCode: "VALIDATION_ERROR" },
        expected: "VALIDATION_ERROR",
      },
      {
        name: "error object code",
        data: { error: { code: "NESTED_CODE" } },
        expected: "NESTED_CODE",
      },
      {
        name: "GraphQL extensions code",
        data: { errors: [{ extensions: { code: "GRAPHQL_CODE" } }] },
        expected: "GRAPHQL_CODE",
      },
      { name: "statusCode field", data: { statusCode: 422 }, expected: 422 },
      {
        name: "JSON:API error code",
        data: { errors: [{ code: "JSON_API_CODE" }] },
        expected: "JSON_API_CODE",
      },
      { name: "JSON:API error status", data: { errors: [{ status: "422" }] }, expected: "422" },
      { name: "type field", data: { type: "ValidationError" }, expected: "ValidationError" },
    ])("extracts code from $name", ({ data, expected }) => {
      const responseError = createResponseError(data);
      const result = extractErrorData(responseError);

      expect(result.extractedCode).toBe(expected);
    });

    it("uses custom code extractors", () => {
      const customExtractor = jest.fn().mockReturnValue("CUSTOM_CODE");

      const responseError = createResponseError({ customField: "CUSTOM_CODE" });
      const result = extractErrorData(responseError, {
        codeExtractors: [customExtractor],
      });

      expect(customExtractor).toHaveBeenCalled();
      expect(result.extractedCode).toBe("CUSTOM_CODE");
    });
  });

  describe("additional details extraction", () => {
    it("extracts common debugging fields", () => {
      const data = {
        message: "Error message",
        timestamp: "2023-01-01T00:00:00Z",
        traceId: "trace-123",
        requestId: "req-456",
        path: "/api/endpoint",
        method: "POST",
      };

      const responseError = createResponseError(data);
      const result = extractErrorData(responseError, { extractDetails: true });

      expect(result.extractedDetails).toMatchObject({
        timestamp: "2023-01-01T00:00:00Z",
        traceId: "trace-123",
        requestId: "req-456",
        path: "/api/endpoint",
        method: "POST",
      });
    });

    it("includes validation errors structure", () => {
      const data = {
        message: "Validation failed",
        errors: {
          email: ["Email is required"],
          password: ["Password too short"],
        },
      };

      const responseError = createResponseError(data);
      const result = extractErrorData(responseError, { extractDetails: true });

      expect(result.extractedDetails).toMatchObject({
        validationErrors: {
          email: ["Email is required"],
          password: ["Password too short"],
        },
      });
    });

    it("skips details extraction when disabled", () => {
      const data = {
        message: "Error message",
        timestamp: "2023-01-01T00:00:00Z",
        traceId: "trace-123",
      };

      const responseError = createResponseError(data);
      const result = extractErrorData(responseError, { extractDetails: false });

      expect(result.extractedDetails).toBeUndefined();
    });
  });

  describe("built-in extractors", () => {
    describe("message extractors", () => {
      it("RFC 7807 extractor works correctly", () => {
        const data = {
          type: "https://example.com/validation-error",
          title: "Validation Error",
          detail: "The request body is invalid",
        };

        const result = builtInMessageExtractors.rfc7807(data);
        expect(result).toBe("The request body is invalid");
      });

      it("Spring Boot extractor works correctly", () => {
        const data = {
          timestamp: "2023-01-01T00:00:00Z",
          status: 400,
          error: "Bad Request",
          message: "Validation failed",
          path: "/api/endpoint",
        };

        const result = builtInMessageExtractors.springBoot(data);
        expect(result).toBe("Validation failed");
      });
    });

    describe("code extractors", () => {
      it("RFC 7807 code extractor works correctly", () => {
        const data = {
          type: "https://example.com/validation-error",
          title: "Validation Error",
          detail: "The request body is invalid",
        };

        const result = builtInCodeExtractors.rfc7807(data);
        expect(result).toBe("https://example.com/validation-error");
      });

      it("GraphQL code extractor works correctly", () => {
        const data = {
          errors: [
            {
              message: 'Variable "$input" is invalid',
              extensions: {
                code: "GRAPHQL_VALIDATION_FAILED",
                exception: {
                  stacktrace: ['Error: Variable "$input" is invalid'],
                },
              },
            },
          ],
        };

        const result = builtInCodeExtractors.graphql(data);
        expect(result).toBe("GRAPHQL_VALIDATION_FAILED");
      });
    });
  });

  describe("edge cases", () => {
    it("handles null and undefined data gracefully", () => {
      expect(extractErrorData(createResponseError(null)).extractedMessage).toBeUndefined();
      expect(extractErrorData(createResponseError()).extractedMessage).toBeUndefined();
    });

    it("handles primitive data types", () => {
      expect(extractErrorData(createResponseError(42)).extractedMessage).toBeUndefined();
      expect(extractErrorData(createResponseError(true)).extractedMessage).toBeUndefined();
    });

    it("handles empty objects and arrays", () => {
      expect(extractErrorData(createResponseError({})).extractedMessage).toBeUndefined();
      expect(extractErrorData(createResponseError([])).extractedMessage).toBeUndefined();
      expect(
        extractErrorData(createResponseError({ errors: [] })).extractedMessage,
      ).toBeUndefined();
    });

    it("handles malformed error structures gracefully", () => {
      const malformedData = {
        errors: [null, undefined, "not an object", { message: null }, { message: 42 }],
      };

      expect(() => extractErrorData(createResponseError(malformedData))).not.toThrow();
      expect(extractErrorData(createResponseError(malformedData)).extractedMessage).toBeUndefined();
    });

    it("stops at maxDepth to prevent infinite recursion", () => {
      // Create a deep object structure where message is deeper than maxDepth
      const deepObject: any = {};
      let current = deepObject;

      // Build a chain deeper than maxDepth (5)
      for (let index = 0; index < 7; index++) {
        current.nested = {};
        current = current.nested;
      }

      // Put the message at depth 7, which should not be found with maxDepth: 5
      current.message = "Should not be found";

      const result = extractErrorData(createResponseError(deepObject), { maxDepth: 5 });
      expect(result.extractedMessage).toBeUndefined();
    });
  });

  describe("performance", () => {
    it("handles large error objects efficiently", () => {
      const largeObject: any = { message: "Large object message" };

      // Add many properties
      for (let index = 0; index < 10_000; index++) {
        largeObject[`field${index}`] = `value${index}`;
      }

      const start = performance.now();
      const result = extractErrorData(createResponseError(largeObject));
      const end = performance.now();

      expect(end - start).toBeLessThan(50); // Should be reasonably fast
      expect(result.extractedMessage).toBe("Large object message");
    });

    it("does not modify the original error data", () => {
      const originalData = { message: "Original message", nested: { value: "nested" } };
      const dataCopy = JSON.parse(JSON.stringify(originalData));

      extractErrorData(createResponseError(originalData));

      expect(originalData).toEqual(dataCopy);
    });
  });
});

/* eslint-enable unicorn/consistent-function-scoping, @typescript-eslint/no-explicit-any, max-nested-callbacks, no-plusplus */
