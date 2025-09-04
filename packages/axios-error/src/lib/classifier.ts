/* eslint-disable sonarjs/prefer-single-boolean-return, @typescript-eslint/prefer-nullish-coalescing, @typescript-eslint/padding-line-between-statements */

import { type AxiosError } from "axios";

import {
  type AbortError,
  type AxiosErrorDetails,
  type ConfigurationError,
  type NetworkError,
  type NetworkErrorCode,
  type ParseError,
  type ResponseError,
  type TimeoutError,
  type UnknownError,
} from "./types";

/**
 * Classifies an axios error into the appropriate discriminated union variant
 */
export function classifyAxiosError(error: unknown): AxiosErrorDetails {
  // Handle non-axios errors
  if (!isAxiosError(error)) {
    return createUnknownError(error, "Non-axios error encountered");
  }

  const axiosError = error;

  // Classification priority order (most specific first)

  // 1. Configuration errors (check first - specific error codes)
  if (isConfigurationError(axiosError)) {
    return createConfigurationError(axiosError);
  }

  // 2. Response parsing errors (check before general response errors)
  if (isParseError(axiosError)) {
    return createParseError(axiosError);
  }

  // 3. Explicit cancellation/abort
  if (isAbortError(axiosError)) {
    return createAbortError(axiosError);
  }

  // 4. Timeout errors
  if (isTimeoutError(axiosError)) {
    return createTimeoutError(axiosError);
  }

  // 5. Network connectivity errors
  if (isNetworkError(axiosError)) {
    return createNetworkError(axiosError);
  }

  // 6. HTTP response errors (4xx, 5xx)
  if (isResponseError(axiosError)) {
    return createResponseError(axiosError);
  }

  // 7. Fallback to unknown
  return createUnknownError(axiosError, "Unclassified axios error");
}

/**
 * Type guard to check if error is from axios
 */
function isAxiosError(error: unknown): error is AxiosError {
  return (
    typeof error === "object" &&
    error !== null &&
    "isAxiosError" in error &&
    error.isAxiosError === true
  );
}

/**
 * Detects abort/cancellation errors
 */
function isAbortError(error: AxiosError): boolean {
  // ERR_CANCELED is always a cancellation
  if (error.code === "ERR_CANCELED") {
    return true;
  }

  // Check for explicit cancellation messages
  if (error.message.includes("canceled")) {
    return true;
  }

  // For "aborted" messages, distinguish between timeout and cancellation
  if (error.message.includes("aborted")) {
    // If it has timeout config or timeout in message, it's likely a timeout
    if (error.config?.timeout || error.message.includes("timeout")) {
      return false; // Let timeout detector handle it
    }
    return true; // Otherwise it's a cancellation
  }

  return false;
}

/**
 * Detects timeout errors
 */
function isTimeoutError(error: AxiosError): boolean {
  // Explicit timeout codes
  if (error.code === "ETIMEDOUT" || error.code === "ERR_TIMEOUT") {
    return true;
  }

  // ECONNABORTED can be either timeout or abort - check context
  if (error.code === "ECONNABORTED") {
    // If message mentions timeout or has timeout config, it's a timeout
    return error.message.includes("timeout") || Boolean(error.config?.timeout);
  }

  // Generic timeout message patterns
  return error.message.includes("timeout");
}

/**
 * Detects network connectivity errors
 */
function isNetworkError(error: AxiosError): boolean {
  if (error.response) {
    // If we have a response, it's not a network error
    return false;
  }

  return (
    error.code === "ERR_NETWORK" ||
    error.code === "ECONNREFUSED" ||
    error.code === "ENOTFOUND" ||
    error.code === "ECONNRESET" ||
    error.code === "EHOSTUNREACH" ||
    error.code === "ENETDOWN" ||
    error.code === "ENETUNREACH" ||
    error.code === "EADDRINUSE" ||
    error.code === "EADDRNOTAVAIL" ||
    error.message.includes("Network Error") ||
    error.message.includes("getaddrinfo ENOTFOUND")
  );
}

/**
 * Detects HTTP response errors
 */
function isResponseError(error: AxiosError): boolean {
  return error.response !== undefined;
}

/**
 * Detects configuration errors
 */
function isConfigurationError(error: AxiosError): boolean {
  return (
    error.code === "ERR_BAD_OPTION" ||
    error.code === "ERR_BAD_OPTION_VALUE" ||
    error.code === "ERR_INVALID_URL" ||
    error.code === "ERR_BAD_REQUEST" ||
    error.message.includes("Invalid URL") ||
    error.message.includes("bad option")
  );
}

/**
 * Detects response parsing errors
 */
function isParseError(error: AxiosError): boolean {
  return (
    error.code === "ERR_BAD_RESPONSE" ||
    error.message.includes("JSON") ||
    error.message.includes("parse") ||
    error.message.includes("Unexpected token")
  );
}

/**
 * Creates a network error with intelligent code classification
 */
function createNetworkError(error: AxiosError): NetworkError {
  const code = classifyNetworkErrorCode(error.code);
  const isRetryable = isNetworkErrorRetryable(code);

  return {
    type: "network",
    code,
    message: error.message,
    userMessage: generateNetworkUserMessage(code),
    isRetryable,
    originalError: error,
  };
}

/**
 * Creates a timeout error with type detection
 */
function createTimeoutError(error: AxiosError): TimeoutError {
  const timeoutType = error.config?.timeout ? "response" : "request";
  const timeout = error.config?.timeout || 0;

  return {
    type: "timeout",
    timeoutType,
    timeout,
    message: error.message,
    userMessage: `Request timed out after ${timeout}ms. Please try again.`,
    isRetryable: true,
    originalError: error,
  };
}

/**
 * Creates a response error with intelligent data extraction
 */
function createResponseError(error: AxiosError): ResponseError {
  const response = error.response!;
  const isRetryable = isHttpStatusRetryable(response.status);

  // Extract headers safely
  const headers: Record<string, string> = {};
  if (response.headers && typeof response.headers === "object") {
    Object.entries(response.headers).forEach(([key, value]) => {
      if (typeof value === "string") {
        headers[key] = value;
      } else if (typeof value === "number") {
        headers[key] = String(value);
      }
    });
  }

  return {
    type: "response",
    status: response.status,
    statusText: response.statusText,
    data: response.data,
    message: error.message,
    userMessage: generateHttpUserMessage(response.status),
    headers,
    isRetryable,
    originalError: error,
    // Intelligent extraction will be added in next phase
    extractedMessage: undefined,
    extractedCode: undefined,
    extractedDetails: undefined,
  };
}

/**
 * Creates a configuration error
 */
function createConfigurationError(error: AxiosError): ConfigurationError {
  return {
    type: "configuration",
    configField: extractConfigField(error),
    message: error.message,
    userMessage: "Invalid request configuration. Please check your request parameters.",
    isRetryable: false,
    originalError: error,
  };
}

/**
 * Creates an abort error
 */
function createAbortError(error: AxiosError): AbortError {
  return {
    type: "abort",
    reason: extractAbortReason(error),
    message: error.message,
    userMessage: "Request was cancelled.",
    isRetryable: false,
    originalError: error,
  };
}

/**
 * Creates a parse error
 */
function createParseError(error: AxiosError): ParseError {
  return {
    type: "parse",
    parseType: detectParseType(error),
    rawData: extractRawData(error),
    message: error.message,
    userMessage: "Server returned invalid data format.",
    isRetryable: false,
    originalError: error,
  };
}

/**
 * Creates an unknown error fallback
 */
function createUnknownError(error: unknown, defaultMessage: string): UnknownError {
  // Extract message from error if available
  let message = defaultMessage;
  if (error instanceof Error) {
    message = error.message;
  } else if (typeof error === "object" && error !== null && "message" in error) {
    const errorObject = error as { message?: unknown };
    if (typeof errorObject.message === "string") {
      message = errorObject.message;
    }
  }

  return {
    type: "unknown",
    message,
    userMessage: "An unexpected error occurred. Please try again.",
    isRetryable: true,
    originalError: error,
  };
}

/**
 * Classifies network error codes
 */
function classifyNetworkErrorCode(code?: string): NetworkErrorCode {
  if (!code) {
    return "UNKNOWN_NETWORK";
  }

  const knownCodes: NetworkErrorCode[] = [
    "ECONNREFUSED",
    "ENOTFOUND",
    "ECONNABORTED",
    "ECONNRESET",
    "EHOSTUNREACH",
    "ENETDOWN",
    "ENETUNREACH",
    "EADDRINUSE",
    "EADDRNOTAVAIL",
    "ERR_NETWORK",
  ];

  return knownCodes.includes(code as NetworkErrorCode)
    ? (code as NetworkErrorCode)
    : "UNKNOWN_NETWORK";
}

/**
 * Determines if a network error is retryable
 * Balances pragmatic retry behavior with avoiding infinite retry loops
 */
function isNetworkErrorRetryable(code: NetworkErrorCode): boolean {
  // Retryable network errors - temporary connectivity issues
  const retryableCodes = new Set<NetworkErrorCode>([
    "ENOTFOUND", // DNS resolution failed - often temporary DNS issues
    "ECONNRESET", // Connection reset - temporary network issue
    "ECONNABORTED", // Connection aborted - temporary issue
    "EHOSTUNREACH", // Host unreachable - temporary routing issue
    "ENETDOWN", // Network is down - temporary network issue
    "ENETUNREACH", // Network unreachable - temporary routing issue
    "ERR_NETWORK", // Generic network error - usually temporary
    "UNKNOWN_NETWORK", // Unknown network error - default to retryable
  ]);

  // Non-retryable network errors - usually configuration or permanent issues
  const nonRetryableCodes = new Set<NetworkErrorCode>([
    "ECONNREFUSED", // Connection refused - server not accepting connections on this port
    "EADDRINUSE", // Address already in use - port conflict
    "EADDRNOTAVAIL", // Address not available - invalid address configuration
  ]);

  if (nonRetryableCodes.has(code)) {
    return false;
  }

  return retryableCodes.has(code);
}

/**
 * Determines if an HTTP status code is retryable
 */
function isHttpStatusRetryable(status: number): boolean {
  // 5xx server errors are generally retryable
  if (status >= 500) {
    return true;
  }

  // Specific 4xx codes that might be retryable
  const retryable4xx = new Set([408, 429]);
  return retryable4xx.has(status);
}

/**
 * Generates user-friendly network error messages
 */
function generateNetworkUserMessage(code: NetworkErrorCode): string {
  const messages: Record<NetworkErrorCode, string> = {
    ECONNREFUSED: "Unable to connect to server. Please check your connection.",
    ENOTFOUND: "Unable to connect to server. Please check the URL.",
    ECONNABORTED: "Unable to connect to server. Connection was interrupted.",
    ECONNRESET: "Unable to connect to server. Connection was reset.",
    EHOSTUNREACH: "Unable to connect to server. Host is unreachable.",
    ENETDOWN: "Unable to connect to server. Network is down.",
    ENETUNREACH: "Unable to connect to server. Network is unreachable.",
    EADDRINUSE: "Unable to connect to server. Address is already in use.",
    EADDRNOTAVAIL: "Unable to connect to server. Address is not available.",
    ERR_NETWORK: "Unable to connect to server. Please try again.",
    UNKNOWN_NETWORK: "Unable to connect to server. Please try again.",
  };

  return messages[code] || "Unable to connect to server. Please try again.";
}

/**
 * Generates user-friendly HTTP error messages
 */
function generateHttpUserMessage(status: number): string {
  if (status >= 500) {
    return "Server error occurred. Please try again later.";
  }

  if (status === 404) {
    return "The requested resource was not found.";
  }

  if (status === 401) {
    return "Authentication required. Please log in.";
  }

  if (status === 403) {
    return "You do not have permission to access this resource.";
  }

  if (status === 400) {
    return "Invalid request. Please check your input.";
  }

  if (status >= 400) {
    return "Request failed. Please check your input and try again.";
  }

  return "An error occurred. Please try again.";
}

/**
 * Extracts configuration field from error message
 */
function extractConfigField(error: AxiosError): string | undefined {
  const message = error.message.toLowerCase();

  if (message.includes("url")) {
    return "url";
  }
  if (message.includes("timeout")) {
    return "timeout";
  }
  if (message.includes("headers")) {
    return "headers";
  }
  if (message.includes("method")) {
    return "method";
  }

  return undefined;
}

/**
 * Extracts abort reason from error
 */
function extractAbortReason(error: AxiosError): string | undefined {
  if (error.message.includes("canceled")) {
    return "canceled";
  }
  if (error.message.includes("aborted")) {
    return "aborted";
  }
  if (error.message.includes("timeout")) {
    return "timeout";
  }

  return undefined;
}

/**
 * Detects parse error type from error message
 */
function detectParseType(error: AxiosError): "json" | "xml" | "text" | "other" {
  const message = error.message.toLowerCase();

  if (message.includes("json")) {
    return "json";
  }
  if (message.includes("xml")) {
    return "xml";
  }
  if (message.includes("text")) {
    return "text";
  }

  return "other";
}

/**
 * Extracts raw data from parse error
 */
function extractRawData(error: AxiosError): string {
  // Try to extract raw response data if available
  if (error.response && typeof error.response.data === "string") {
    return error.response.data;
  }

  return error.message;
}

/* eslint-enable sonarjs/prefer-single-boolean-return, @typescript-eslint/prefer-nullish-coalescing, @typescript-eslint/padding-line-between-statements */
