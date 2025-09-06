/* eslint-disable unicorn/filename-case, @typescript-eslint/prefer-nullish-coalescing */

import { classifyAxiosError } from "./classifier";
import { extractErrorData } from "./extractor";
import {
  type AbortError,
  type AxiosErrorDetails,
  type ConfigurationError,
  type EnhancedAxiosError,
  type ExtractionConfig,
  type NetworkError,
  type ParseError,
  type ResponseError,
  type TimeoutError,
  type UnknownError,
} from "./types";

/**
 * Enhanced axios error wrapper with intelligent classification and ergonomic API
 */
export class EnhancedAxiosErrorImpl implements EnhancedAxiosError {
  readonly details: AxiosErrorDetails;
  readonly httpStatus: number;
  readonly isRetryable: boolean;

  constructor(error: unknown, extractionConfig?: ExtractionConfig) {
    this.details = classifyAxiosError(error);
    this.isRetryable = this.details.isRetryable;

    // Determine appropriate HTTP status for framework integrations
    this.httpStatus = this.determineHttpStatus();

    // Apply intelligent data extraction for response errors
    if (this.details.type === "response") {
      const extracted = extractErrorData(this.details, extractionConfig);
      this.details = {
        ...this.details,
        ...extracted,
      };
    }
  }

  // Type guards with TypeScript narrowing
  isNetworkError(): this is EnhancedAxiosError & { details: NetworkError } {
    return this.details.type === "network";
  }

  isTimeoutError(): this is EnhancedAxiosError & { details: TimeoutError } {
    return this.details.type === "timeout";
  }

  isResponseError(): this is EnhancedAxiosError & { details: ResponseError } {
    return this.details.type === "response";
  }

  isConfigurationError(): this is EnhancedAxiosError & { details: ConfigurationError } {
    return this.details.type === "configuration";
  }

  isAbortError(): this is EnhancedAxiosError & { details: AbortError } {
    return this.details.type === "abort";
  }

  isParseError(): this is EnhancedAxiosError & { details: ParseError } {
    return this.details.type === "parse";
  }

  isUnknownError(): this is EnhancedAxiosError & { details: UnknownError } {
    return this.details.type === "unknown";
  }

  // Convenience accessors (available regardless of error type)
  get message(): string {
    return this.details.message;
  }

  get userMessage(): string {
    return this.details.userMessage;
  }

  get code(): string | number | undefined {
    if (this.details.type === "network") {
      return this.details.code;
    }

    if (this.details.type === "response") {
      return this.details.extractedCode || this.details.status;
    }

    return undefined;
  }

  // Framework integrations
  toJSON(): Record<string, unknown> {
    const base = {
      type: this.details.type,
      message: this.details.message,
      userMessage: this.details.userMessage,
      isRetryable: this.isRetryable,
      httpStatus: this.httpStatus,
    };

    // Add type-specific fields
    switch (this.details.type) {
      case "network": {
        return {
          ...base,
          code: this.details.code,
        };
      }

      case "timeout": {
        return {
          ...base,
          timeoutType: this.details.timeoutType,
          timeout: this.details.timeout,
        };
      }

      case "response": {
        return {
          ...base,
          status: this.details.status,
          statusText: this.details.statusText,
          data: this.details.data,
          extractedMessage: this.details.extractedMessage,
          extractedCode: this.details.extractedCode,
          extractedDetails: this.details.extractedDetails,
        };
      }

      case "configuration": {
        return {
          ...base,
          configField: this.details.configField,
        };
      }

      case "abort": {
        return {
          ...base,
          reason: this.details.reason,
        };
      }

      case "parse": {
        return {
          ...base,
          parseType: this.details.parseType,
          rawData: this.details.rawData,
        };
      }

      default: {
        return base;
      }
    }
  }

  toString(): string {
    const prefix = `[${this.details.type.toUpperCase()}]`;
    const retryable = this.isRetryable ? " (retryable)" : "";

    if (this.details.type === "response") {
      return `${prefix} HTTP ${this.details.status}: ${this.details.message}${retryable}`;
    }

    if (this.details.type === "network") {
      return `${prefix} ${this.details.code}: ${this.details.message}${retryable}`;
    }

    return `${prefix} ${this.details.message}${retryable}`;
  }

  private determineHttpStatus(): number {
    switch (this.details.type) {
      case "response": {
        return this.details.status;
      }

      case "timeout": {
        return 408;
      } // Request Timeout

      case "network": {
        return 503;
      } // Service Unavailable

      case "configuration":
      case "parse": {
        return 400;
      } // Bad Request

      case "abort": {
        return 499;
      } // Client Closed Request (nginx convention)

      default: {
        return 500;
      } // Internal Server Error
    }
  }
}

/* eslint-enable unicorn/filename-case, @typescript-eslint/prefer-nullish-coalescing */
