/* eslint-disable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-explicit-any, @typescript-eslint/consistent-type-assertions, @typescript-eslint/prefer-nullish-coalescing, unicorn/no-array-push-push */

import { type AxiosError, type AxiosRequestConfig, type AxiosResponse } from "axios";

/**
 * Test utilities for creating real axios errors with all the proper properties
 * and inheritance chain. These are as close to real axios errors as possible.
 */

/**
 * Configuration for creating test axios errors
 */
interface AxiosErrorTestConfig {
  message?: string;
  code?: string;
  config?: Partial<AxiosRequestConfig>;
  request?: unknown;
  response?: Partial<AxiosResponse>;
  stack?: string;
}

/**
 * Creates a real AxiosError instance for testing
 */
function createAxiosError(config: AxiosErrorTestConfig = {}): AxiosError {
  const {
    message = "Request failed",
    code,
    config: requestConfig = {},
    request,
    response,
    stack,
  } = config;

  // Create a real AxiosError-like object with proper prototype chain
  const error = Object.create(Error.prototype) as AxiosError;

  // Set standard Error properties
  error.name = "AxiosError";
  error.message = message;
  if (stack) {
    error.stack = stack;
  }

  // Set axios-specific properties
  error.isAxiosError = true;
  error.toJSON = function () {
    return {
      message: this.message,
      name: this.name,
      stack: this.stack,
      config: this.config,
      code: this.code,
    };
  };

  // Set optional properties
  if (code) {
    error.code = code;
  }

  if (requestConfig) {
    error.config = requestConfig as any;
  }

  if (request) {
    error.request = request;
  }

  if (response) {
    error.response = {
      ...response,
      config: {} as any,
      request: {} as any,
      statusText: response.statusText || "Unknown",
      headers: response.headers || {},
    } as AxiosResponse;
  }

  return error;
}

/**
 * Creates network error scenarios
 */
const networkErrors = {
  connectionRefused: (): AxiosError =>
    createAxiosError({
      message: "connect ECONNREFUSED 127.0.0.1:3000",
      code: "ECONNREFUSED",
    }),

  dnsNotFound: (): AxiosError =>
    createAxiosError({
      message: "getaddrinfo ENOTFOUND example.invalid",
      code: "ENOTFOUND",
    }),

  connectionReset: (): AxiosError =>
    createAxiosError({
      message: "socket hang up",
      code: "ECONNRESET",
    }),

  networkError: (): AxiosError =>
    createAxiosError({
      message: "Network Error",
      code: "ERR_NETWORK",
    }),

  hostUnreachable: (): AxiosError =>
    createAxiosError({
      message: "connect EHOSTUNREACH 192.168.1.1:80",
      code: "EHOSTUNREACH",
    }),

  networkDown: (): AxiosError =>
    createAxiosError({
      message: "network is down",
      code: "ENETDOWN",
    }),
};

/**
 * Creates timeout error scenarios
 */
const timeoutErrors = {
  requestTimeout: (): AxiosError =>
    createAxiosError({
      message: "timeout of 5000ms exceeded",
      code: "ETIMEDOUT",
      config: { timeout: 5000 },
    }),

  connectionTimeout: (): AxiosError =>
    createAxiosError({
      message: "timeout of 10000ms exceeded",
      code: "ECONNABORTED",
      config: { timeout: 10_000 },
    }),

  responseTimeout: (): AxiosError =>
    createAxiosError({
      message: "Request aborted",
      code: "ECONNABORTED",
      config: { timeout: 5000 },
    }),
};

/**
 * Creates response error scenarios with various data formats
 */
const responseErrors = {
  simpleMessage: (status = 400, message = "Bad Request"): AxiosError =>
    createAxiosError({
      message: `Request failed with status code ${status}`,
      response: {
        status,
        statusText: "Bad Request",
        data: message,
        headers: { "content-type": "text/plain" },
        config: {} as any,
        request: {} as any,
      } as AxiosResponse,
    }),

  objectMessage: (status = 400, message = "Invalid input"): AxiosError =>
    createAxiosError({
      message: `Request failed with status code ${status}`,
      response: {
        status,
        statusText: "Bad Request",
        data: { message },
        headers: { "content-type": "application/json" },
        config: {} as any,
        request: {} as any,
      } as AxiosResponse,
    }),

  objectError: (status = 400, error = "Invalid request"): AxiosError =>
    createAxiosError({
      message: `Request failed with status code ${status}`,
      response: {
        status,
        statusText: "Bad Request",
        data: { error },
        headers: { "content-type": "application/json" },
        config: {} as any,
        request: {} as any,
      } as AxiosResponse,
    }),

  errorsArray: (status = 422, message = "Validation failed"): AxiosError =>
    createAxiosError({
      message: `Request failed with status code ${status}`,
      response: {
        status,
        statusText: "Unprocessable Entity",
        data: { errors: [{ message }] },
        headers: { "content-type": "application/json" },
        config: {} as any,
        request: {} as any,
      } as AxiosResponse,
    }),

  nestedErrors: (status = 400, message = "Nested error"): AxiosError =>
    createAxiosError({
      message: `Request failed with status code ${status}`,
      response: {
        status,
        statusText: "Bad Request",
        data: { data: { errors: [{ message }] } },
        headers: { "content-type": "application/json" },
        config: {} as any,
        request: {} as any,
      } as AxiosResponse,
    }),

  graphqlErrors: (message = "GraphQL error"): AxiosError =>
    createAxiosError({
      message: "Request failed with status code 200",
      response: {
        status: 200,
        statusText: "OK",
        data: {
          errors: [
            {
              message,
              extensions: { code: "VALIDATION_ERROR" },
            },
          ],
        },
        headers: { "content-type": "application/json" },
        config: {} as any,
        request: {} as any,
      } as AxiosResponse,
    }),

  jsonApiErrors: (detail = "Invalid attribute", code = "INVALID_ATTRIBUTE"): AxiosError =>
    createAxiosError({
      message: "Request failed with status code 422",
      response: {
        status: 422,
        statusText: "Unprocessable Entity",
        data: {
          errors: [
            {
              status: "422",
              code,
              title: "Invalid Attribute",
              detail,
            },
          ],
        },
        headers: { "content-type": "application/vnd.api+json" },
        config: {} as any,
        request: {} as any,
      } as AxiosResponse,
    }),

  rfc7807Problem: (detail = "Problem detail", type = "about:blank"): AxiosError =>
    createAxiosError({
      message: "Request failed with status code 400",
      response: {
        status: 400,
        statusText: "Bad Request",
        data: {
          type,
          title: "Bad Request",
          detail,
          status: 400,
        },
        headers: { "content-type": "application/problem+json" },
        config: {} as any,
        request: {} as any,
      } as AxiosResponse,
    }),

  validationErrors: (field = "email", error = "is required"): AxiosError =>
    createAxiosError({
      message: "Request failed with status code 422",
      response: {
        status: 422,
        statusText: "Unprocessable Entity",
        data: {
          errors: {
            [field]: [error],
          },
        },
        headers: { "content-type": "application/json" },
        config: {} as any,
        request: {} as any,
      } as AxiosResponse,
    }),

  serverError: (status = 500): AxiosError =>
    createAxiosError({
      message: `Request failed with status code ${status}`,
      response: {
        status,
        statusText: "Internal Server Error",
        data: "Internal server error",
        headers: { "content-type": "text/html" },
        config: {} as any,
        request: {} as any,
      } as AxiosResponse,
    }),
};

/**
 * Creates configuration error scenarios
 */
const configurationErrors = {
  badOption: (): AxiosError =>
    createAxiosError({
      message: "Invalid option provided",
      code: "ERR_BAD_OPTION",
    }),

  badOptionValue: (): AxiosError =>
    createAxiosError({
      message: "Invalid value for option timeout",
      code: "ERR_BAD_OPTION_VALUE",
    }),

  invalidUrl: (): AxiosError =>
    createAxiosError({
      message: "Invalid URL: not-a-url",
      code: "ERR_INVALID_URL",
    }),

  badRequest: (): AxiosError =>
    createAxiosError({
      message: "Bad request configuration",
      code: "ERR_BAD_REQUEST",
    }),
};

/**
 * Creates abort/cancellation error scenarios
 */
const abortErrors = {
  canceled: (): AxiosError =>
    createAxiosError({
      message: "Request canceled",
      code: "ERR_CANCELED",
    }),

  aborted: (): AxiosError =>
    createAxiosError({
      message: "Request aborted",
      code: "ECONNABORTED",
    }),

  userAborted: (reason = "User cancelled"): AxiosError =>
    createAxiosError({
      message: `Request canceled: ${reason}`,
      code: "ERR_CANCELED",
    }),
};

/**
 * Creates parse error scenarios
 */
const parseErrors = {
  jsonParse: (): AxiosError =>
    createAxiosError({
      message: "Unexpected token < in JSON at position 0",
      code: "ERR_BAD_RESPONSE",
      response: {
        status: 200,
        statusText: "OK",
        data: "<html><body>Not JSON</body></html>",
        headers: { "content-type": "text/html" },
        config: {} as any,
        request: {} as any,
      } as AxiosResponse,
    }),

  invalidJson: (): AxiosError =>
    createAxiosError({
      message: "Invalid JSON response",
      code: "ERR_BAD_RESPONSE",
    }),

  xmlParse: (): AxiosError =>
    createAxiosError({
      message: "XML parsing error",
      code: "ERR_BAD_RESPONSE",
    }),
};

/**
 * Creates unknown/unclassified error scenarios
 */
const unknownErrors = {
  nonAxiosError: (): Error => new Error("Not an axios error"),

  weirdAxiosError: (): AxiosError =>
    createAxiosError({
      message: "Something very unusual happened",
      code: "WEIRD_ERROR",
    }),

  nullError: (): undefined => null,
  undefinedError: (): undefined => undefined,
  stringError: (): string => "Just a string",
  numberError: (): number => 42,
};

/**
 * Comprehensive test suite data for all error scenarios
 */
export const allErrorScenarios = {
  network: networkErrors,
  timeout: timeoutErrors,
  response: responseErrors,
  configuration: configurationErrors,
  abort: abortErrors,
  parse: parseErrors,
  unknown: unknownErrors,
};

/**
 * Helper to generate all combinations for comprehensive testing
 */
export function getAllErrorCombinations(): Array<{
  category: string;
  scenario: string;
  error: unknown;
  expected: {
    type: string;
    isRetryable: boolean;
    httpStatus: number;
  };
}> {
  const combinations: Array<{
    category: string;
    scenario: string;
    error: unknown;
    expected: { type: string; isRetryable: boolean; httpStatus: number };
  }> = [];

  // Network errors - differentiate based on retryability logic
  Object.entries(networkErrors).forEach(([scenario, errorFunction]) => {
    const nonRetryableScenarios = ["connectionRefused"];
    const isRetryable = !nonRetryableScenarios.includes(scenario);

    combinations.push({
      category: "network",
      scenario,
      error: errorFunction(),
      expected: { type: "network", isRetryable, httpStatus: 503 },
    });
  });

  // Timeout errors
  Object.entries(timeoutErrors).forEach(([scenario, errorFunction]) => {
    combinations.push({
      category: "timeout",
      scenario,
      error: errorFunction(),
      expected: { type: "timeout", isRetryable: true, httpStatus: 408 },
    });
  });

  // Response errors
  combinations.push({
    category: "response",
    scenario: "simpleMessage400",
    error: responseErrors.simpleMessage(400),
    expected: { type: "response", isRetryable: false, httpStatus: 400 },
  });

  combinations.push({
    category: "response",
    scenario: "serverError500",
    error: responseErrors.serverError(500),
    expected: { type: "response", isRetryable: true, httpStatus: 500 },
  });

  // Configuration errors
  Object.entries(configurationErrors).forEach(([scenario, errorFunction]) => {
    combinations.push({
      category: "configuration",
      scenario,
      error: errorFunction(),
      expected: { type: "configuration", isRetryable: false, httpStatus: 400 },
    });
  });

  // Abort errors
  Object.entries(abortErrors).forEach(([scenario, errorFunction]) => {
    combinations.push({
      category: "abort",
      scenario,
      error: errorFunction(),
      expected: { type: "abort", isRetryable: false, httpStatus: 499 },
    });
  });

  // Parse errors
  Object.entries(parseErrors).forEach(([scenario, errorFunction]) => {
    combinations.push({
      category: "parse",
      scenario,
      error: errorFunction(),
      expected: { type: "parse", isRetryable: false, httpStatus: 400 },
    });
  });

  // Unknown errors
  Object.entries(unknownErrors).forEach(([scenario, errorFunction]) => {
    combinations.push({
      category: "unknown",
      scenario,
      error: errorFunction(),
      expected: { type: "unknown", isRetryable: true, httpStatus: 500 },
    });
  });

  return combinations;
}

/* eslint-enable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-explicit-any, @typescript-eslint/consistent-type-assertions, @typescript-eslint/prefer-nullish-coalescing, unicorn/no-array-push-push */
