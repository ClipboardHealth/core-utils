/* eslint-disable no-use-before-define, @typescript-eslint/member-ordering */

import { type AxiosError } from "axios";

/**
 * Comprehensive discriminated union for all possible axios error types.
 * Each variant provides type-safe access to relevant error information.
 */
export type AxiosErrorDetails =
  | NetworkError
  | TimeoutError
  | ResponseError
  | ConfigurationError
  | AbortError
  | ParseError
  | UnknownError;

/**
 * Network connectivity errors (DNS resolution, connection failures, etc.)
 */
export interface NetworkError {
  readonly type: "network";
  readonly code: NetworkErrorCode;
  readonly message: string;
  readonly userMessage: string;
  readonly isRetryable: boolean;
  readonly originalError: AxiosError;
}

/**
 * Request or response timeout errors
 */
export interface TimeoutError {
  readonly type: "timeout";
  readonly timeoutType: "request" | "response";
  readonly timeout: number;
  readonly message: string;
  readonly userMessage: string;
  readonly isRetryable: boolean;
  readonly originalError: AxiosError;
}

/**
 * HTTP response errors (4xx, 5xx status codes)
 */
export interface ResponseError {
  readonly type: "response";
  readonly status: number;
  readonly statusText: string;
  readonly data: unknown;
  readonly message: string;
  readonly userMessage: string;
  readonly headers: Record<string, string>;
  readonly isRetryable: boolean;
  readonly originalError: AxiosError;

  // Convenience extraction results
  readonly extractedMessage?: string | undefined;
  readonly extractedCode?: string | number | undefined;
  readonly extractedDetails?: unknown;
}

/**
 * Request configuration errors (invalid URLs, bad options, etc.)
 */
export interface ConfigurationError {
  readonly type: "configuration";
  readonly configField?: string | undefined;
  readonly message: string;
  readonly userMessage: string;
  readonly isRetryable: false;
  readonly originalError: AxiosError;
}

/**
 * Explicitly cancelled requests (AbortController, CancelToken)
 */
export interface AbortError {
  readonly type: "abort";
  readonly reason?: string | undefined;
  readonly message: string;
  readonly userMessage: string;
  readonly isRetryable: false;
  readonly originalError: AxiosError;
}

/**
 * Response parsing errors (invalid JSON, etc.)
 */
export interface ParseError {
  readonly type: "parse";
  readonly parseType: "json" | "xml" | "text" | "other";
  readonly rawData: string;
  readonly message: string;
  readonly userMessage: string;
  readonly isRetryable: false;
  readonly originalError: AxiosError;
}

/**
 * Fallback for unclassified errors
 */
export interface UnknownError {
  readonly type: "unknown";
  readonly message: string;
  readonly userMessage: string;
  readonly isRetryable: boolean;
  readonly originalError: AxiosError | unknown;
}

/**
 * Network error codes from Node.js and browser environments
 */
export type NetworkErrorCode =
  | "ECONNREFUSED" // Connection refused
  | "ENOTFOUND" // DNS lookup failed
  | "ECONNABORTED" // Connection aborted
  | "ECONNRESET" // Connection reset
  | "EHOSTUNREACH" // Host unreachable
  | "ENETDOWN" // Network is down
  | "ENETUNREACH" // Network unreachable
  | "EADDRINUSE" // Address in use
  | "EADDRNOTAVAIL" // Address not available
  | "ERR_NETWORK" // Generic network error (browser)
  | "UNKNOWN_NETWORK"; // Fallback for unrecognized codes

/**
 * Axios internal error codes
 */
export type AxiosInternalCode =
  | "ERR_FR_TOO_MANY_REDIRECTS"
  | "ERR_BAD_OPTION_VALUE"
  | "ERR_BAD_OPTION"
  | "ERR_NETWORK"
  | "ERR_DEPRECATED"
  | "ERR_BAD_RESPONSE"
  | "ERR_BAD_REQUEST"
  | "ERR_CANCELED"
  | "ERR_INVALID_URL"
  | "ECONNABORTED"
  | "ETIMEDOUT";

/**
 * Enhanced axios error wrapper with intelligent classification and type guards
 */
export interface EnhancedAxiosError {
  readonly details: AxiosErrorDetails;
  readonly httpStatus: number;
  readonly isRetryable: boolean;

  // Type guards for TypeScript narrowing
  isNetworkError(): this is EnhancedAxiosError & { details: NetworkError };
  isTimeoutError(): this is EnhancedAxiosError & { details: TimeoutError };
  isResponseError(): this is EnhancedAxiosError & { details: ResponseError };
  isConfigurationError(): this is EnhancedAxiosError & { details: ConfigurationError };
  isAbortError(): this is EnhancedAxiosError & { details: AbortError };
  isParseError(): this is EnhancedAxiosError & { details: ParseError };
  isUnknownError(): this is EnhancedAxiosError & { details: UnknownError };

  // Convenience accessors (available regardless of error type)
  readonly message: string;
  readonly userMessage: string;
  readonly code?: string | number | undefined;

  // Framework integrations
  toJSON(): Record<string, unknown>;
  toString(): string;
}

/**
 * Configuration for data extraction
 */
export interface ExtractionConfig {
  /**
   * Custom message extractors for different API standards
   */
  messageExtractors?: MessageExtractor[];

  /**
   * Custom code extractors
   */
  codeExtractors?: CodeExtractor[];

  /**
   * Whether to extract nested error details
   */
  extractDetails?: boolean;

  /**
   * Maximum depth for nested object traversal
   */
  maxDepth?: number;
}

/**
 * Custom message extractor function
 */
export type MessageExtractor = (data: unknown) => string | undefined;

/**
 * Custom code extractor function
 */
export type CodeExtractor = (data: unknown) => string | number | undefined;

/**
 * Result type for operations that may fail
 */
export type Result<T> =
  | {
      data: T;
      error: undefined;
    }
  | {
      data: undefined;
      error: EnhancedAxiosError;
    };
