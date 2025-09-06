/* eslint-disable @typescript-eslint/no-explicit-any, global-require, @typescript-eslint/no-require-imports, @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unnecessary-type-assertion, consistent-return, sonarjs/no-redundant-jump, no-useless-return, @typescript-eslint/no-var-requires, @typescript-eslint/no-unsafe-return */

import { type AxiosError as AxiosErrorType, type AxiosPromise } from "axios";

import { EnhancedAxiosErrorImpl } from "./enhanced-error";
import { type EnhancedAxiosError, type ExtractionConfig, type Result } from "./types";

/**
 * Main AxiosError class with static factory methods
 */
export const AxiosError = {
  /**
   * Converts any error into an enhanced axios error
   *
   * @example
   * ```typescript
   * try {
   *   await axios.get('/api/data')
   * } catch (error) {
   *   const axiosError = AxiosError.from(error)
   *
   *   if (axiosError.isTimeoutError()) {
   *     console.log(`Request timed out: ${axiosError.message}`)
   *   }
   *
   *   if (axiosError.isResponseError()) {
   *     console.log(`Server error ${axiosError.details.status}: ${axiosError.message}`)
   *     console.log('Response data:', axiosError.details.data)
   *   }
   * }
   * ```
   */
  from(error: unknown, config?: ExtractionConfig): EnhancedAxiosError {
    return new EnhancedAxiosErrorImpl(error, config);
  },

  /**
   * Wraps an axios promise and returns a Result type instead of throwing
   *
   * @example
   * ```typescript
   * const { data, error } = await AxiosError.fromPromise(axios.get('/api/data'))
   * if (error) {
   *   console.log(error.userMessage) // "Unable to connect to server"
   *   console.log(error.message)     // Technical details
   * } else {
   *   console.log('Success:', data)
   * }
   * ```
   */
  async fromPromise<T>(promise: AxiosPromise<T>, config?: ExtractionConfig): Promise<Result<T>> {
    try {
      const response = await promise;
      return {
        data: response.data,
        error: null,
      };
    } catch (error) {
      return {
        data: null,
        error: AxiosError.from(error, config),
      };
    }
  },
};

/**
 * Type guard to check if an error is from axios
 */
export function isAxiosError(error: unknown): error is AxiosErrorType {
  return (
    typeof error === "object" &&
    error !== null &&
    "isAxiosError" in error &&
    (error as any).isAxiosError === true
  );
}

/**
 * Extracts error message using the same intelligent extraction as EnhancedAxiosError
 * Useful for quick message extraction without full error classification
 */
export function extractMessage(error: unknown): string {
  return AxiosError.from(error).message;
}

/**
 * Extracts user-friendly message
 * Useful for displaying to end users
 */
export function extractUserMessage(error: unknown): string {
  return AxiosError.from(error).userMessage;
}

/**
 * Checks if an error is retryable
 */
export function isRetryable(error: unknown): boolean {
  return AxiosError.from(error).isRetryable;
}

/**
 * Gets appropriate HTTP status code for an axios error
 */
export function getHttpStatus(error: unknown): number {
  return AxiosError.from(error).httpStatus;
}

/**
 * Framework integration helpers
 */
export const integrations = {
  /**
   * Creates a NestJS HttpException from axios error
   * Requires @nestjs/common to be available
   */
  toHttpException: (error: unknown) => {
    const enhanced = AxiosError.from(error);

    // Try to import HttpException dynamically
    try {
      // Dynamic import for optional NestJS dependency
      const nestjsCommon = require("@nestjs/common");
      const HttpException = nestjsCommon.HttpException as any;

      return new HttpException(
        {
          message: enhanced.userMessage,
          error: enhanced.details.type,
          statusCode: enhanced.httpStatus,
          details: enhanced.toJSON(),
        },
        enhanced.httpStatus,
      );
    } catch {
      // Fallback if NestJS not available
      throw new Error(`HTTP ${enhanced.httpStatus}: ${enhanced.userMessage}`);
    }
  },

  /**
   * Creates an Express.js error response
   */
  toExpressResponse: (error: unknown) => {
    const enhanced = AxiosError.from(error);

    return {
      status: enhanced.httpStatus,
      json: {
        error: enhanced.details.type,
        message: enhanced.userMessage,
        details: enhanced.toJSON(),
      },
    };
  },

  /**
   * Creates a generic API error response
   */
  toApiResponse: (error: unknown) => {
    const enhanced = AxiosError.from(error);

    return {
      success: false,
      error: {
        type: enhanced.details.type,
        message: enhanced.userMessage,
        code: enhanced.code,
        retryable: enhanced.isRetryable,
      },
      timestamp: new Date().toISOString(),
    };
  },
};

/**
 * Configuration presets for common API standards
 */
export const presets = {
  /**
   * Configuration for GraphQL APIs
   */
  graphql: (): ExtractionConfig => ({
    messageExtractors: [
      (data) => {
        if (typeof data === "object" && data !== null) {
          const object = data as Record<string, unknown>;
          if (Array.isArray(object["errors"]) && object["errors"].length > 0) {
            const firstError = object["errors"][0] as Record<string, unknown>;
            if (typeof firstError["message"] === "string") {
              return firstError["message"];
            }
          }
        }

        return;
      },
    ],
    codeExtractors: [
      (data) => {
        if (typeof data === "object" && data !== null) {
          const object = data as Record<string, unknown>;
          if (Array.isArray(object["errors"]) && object["errors"].length > 0) {
            const firstError = object["errors"][0] as Record<string, unknown>;
            if (typeof firstError["extensions"] === "object" && firstError["extensions"] !== null) {
              const extensions = firstError["extensions"] as Record<string, unknown>;
              if (typeof extensions["code"] === "string") {
                return extensions["code"];
              }
            }
          }
        }

        return;
      },
    ],
  }),

  /**
   * Configuration for JSON:API specification
   */
  jsonApi: (): ExtractionConfig => ({
    messageExtractors: [
      (data) => {
        if (typeof data === "object" && data !== null) {
          const object = data as Record<string, unknown>;
          if (Array.isArray(object["errors"]) && object["errors"].length > 0) {
            const firstError = object["errors"][0] as Record<string, unknown>;
            if (typeof firstError["detail"] === "string") {
              return firstError["detail"];
            }

            if (typeof firstError["title"] === "string") {
              return firstError["title"];
            }
          }
        }

        return;
      },
    ],
    codeExtractors: [
      (data) => {
        if (typeof data === "object" && data !== null) {
          const object = data as Record<string, unknown>;
          if (Array.isArray(object["errors"]) && object["errors"].length > 0) {
            const firstError = object["errors"][0] as Record<string, unknown>;
            if (typeof firstError["code"] === "string") {
              return firstError["code"];
            }

            if (typeof firstError["status"] === "string") {
              return firstError["status"];
            }
          }
        }

        return;
      },
    ],
  }),

  /**
   * Configuration for RFC 7807 Problem Details
   */
  rfc7807: (): ExtractionConfig => ({
    messageExtractors: [
      (data) => {
        if (typeof data === "object" && data !== null) {
          const object = data as Record<string, unknown>;
          if (typeof object["detail"] === "string") {
            return object["detail"];
          }

          if (typeof object["title"] === "string") {
            return object["title"];
          }
        }

        return;
      },
    ],
    codeExtractors: [
      (data) => {
        if (typeof data === "object" && data !== null) {
          const object = data as Record<string, unknown>;
          if (typeof object["type"] === "string") {
            return object["type"];
          }
        }

        return;
      },
    ],
  }),
};

/* eslint-enable @typescript-eslint/no-explicit-any, global-require, @typescript-eslint/no-require-imports, @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unnecessary-type-assertion, consistent-return, sonarjs/no-redundant-jump, no-useless-return, @typescript-eslint/no-var-requires, @typescript-eslint/no-unsafe-return */
