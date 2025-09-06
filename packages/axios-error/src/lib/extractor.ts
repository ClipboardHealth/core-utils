/* eslint-disable @typescript-eslint/no-unsafe-assignment, consistent-return, no-eq-null, complexity, sonarjs/cognitive-complexity */

import {
  type CodeExtractor,
  type ExtractionConfig,
  type MessageExtractor,
  type ResponseError,
} from "./types";

/**
 * Intelligent data extraction from axios response errors.
 * Supports all common API patterns: REST, GraphQL, JSON:API, and custom formats.
 */
export function extractErrorData(
  responseError: ResponseError,
  config: ExtractionConfig = {},
): Pick<ResponseError, "extractedMessage" | "extractedCode" | "extractedDetails"> {
  const { data } = responseError;
  const {
    messageExtractors = [],
    codeExtractors = [],
    extractDetails = true,
    maxDepth = 5,
  } = config;

  return {
    extractedMessage: extractMessage(data, messageExtractors, maxDepth),
    extractedCode: extractCode(data, codeExtractors, maxDepth),
    extractedDetails: extractDetails ? extractAdditionalDetails(data, maxDepth) : undefined,
  };
}

/**
 * Extracts error message from response data using various strategies
 */
function extractMessage(
  data: unknown,
  customExtractors: MessageExtractor[] = [],
  maxDepth = 5,
): string | undefined {
  if (maxDepth <= 0 || data == null) {
    return undefined;
  }

  // Try custom extractors first
  for (const extractor of customExtractors) {
    try {
      const result = extractor(data);
      if (result) {
        return result;
      }
    } catch {
      // Ignore extractor errors, try next one
    }
  }

  // Handle string responses directly
  if (typeof data === "string") {
    return data.trim() || undefined;
  }

  // Handle non-objects
  if (typeof data !== "object" || data === null) {
    return;
  }

  const object = data as Record<string, unknown>;

  // Standard patterns in priority order

  // 1. Direct message field
  if (typeof object["message"] === "string" && object["message"].trim()) {
    return object["message"].trim();
  }

  // 2. Error field (common in many APIs)
  if (typeof object["error"] === "string" && object["error"].trim()) {
    return object["error"].trim();
  }

  // 3. Error object with message
  if (typeof object["error"] === "object" && object["error"] !== null) {
    const errorObject = object["error"] as Record<string, unknown>;
    if (typeof errorObject["message"] === "string" && errorObject["message"].trim()) {
      return errorObject["message"].trim();
    }
  }

  // 4. GraphQL errors array
  if (Array.isArray(object["errors"]) && object["errors"].length > 0) {
    const firstError = object["errors"][0];
    if (typeof firstError === "object" && firstError !== null) {
      const errorObject = firstError as Record<string, unknown>;
      if (typeof errorObject["message"] === "string" && errorObject["message"].trim()) {
        return errorObject["message"].trim();
      }
    }
  }

  // 5. Nested data.errors structure (common in GraphQL)
  if (typeof object["data"] === "object" && object["data"] !== null) {
    const dataObject = object["data"] as Record<string, unknown>;
    if (Array.isArray(dataObject["errors"]) && dataObject["errors"].length > 0) {
      const firstError = dataObject["errors"][0];
      if (typeof firstError === "object" && firstError !== null) {
        const errorObject = firstError as Record<string, unknown>;
        if (typeof errorObject["message"] === "string" && errorObject["message"].trim()) {
          return errorObject["message"].trim();
        }
      }
    }
  }

  // 6. Detail field (common in Django REST framework)
  if (typeof object["detail"] === "string" && object["detail"].trim()) {
    return object["detail"].trim();
  }

  // 7. Details array
  if (Array.isArray(object["details"]) && object["details"].length > 0) {
    const firstDetail = object["details"][0];
    if (typeof firstDetail === "string" && firstDetail.trim()) {
      return firstDetail.trim();
    }

    if (typeof firstDetail === "object" && firstDetail !== null) {
      const detailObject = firstDetail as Record<string, unknown>;
      if (typeof detailObject["message"] === "string" && detailObject["message"].trim()) {
        return detailObject["message"].trim();
      }
    }
  }

  // 8. JSON:API errors structure
  if (Array.isArray(object["errors"]) && object["errors"].length > 0) {
    const firstError = object["errors"][0];
    if (typeof firstError === "object" && firstError !== null) {
      const errorObject = firstError as Record<string, unknown>;

      // JSON:API detail field
      if (typeof errorObject["detail"] === "string" && errorObject["detail"].trim()) {
        return errorObject["detail"].trim();
      }

      // JSON:API title field
      if (typeof errorObject["title"] === "string" && errorObject["title"].trim()) {
        return errorObject["title"].trim();
      }
    }
  }

  // 9. Validation errors (common patterns)
  if (
    typeof object["errors"] === "object" &&
    object["errors"] !== null &&
    !Array.isArray(object["errors"])
  ) {
    const errorsObject = object["errors"] as Record<string, unknown>;

    // Field-specific errors
    for (const [fieldName, fieldErrors] of Object.entries(errorsObject)) {
      if (Array.isArray(fieldErrors) && fieldErrors.length > 0) {
        const firstFieldError = fieldErrors[0];
        if (typeof firstFieldError === "string" && firstFieldError.trim()) {
          return `${fieldName}: ${firstFieldError.trim()}`;
        }
      }

      if (typeof fieldErrors === "string" && fieldErrors.trim()) {
        return `${fieldName}: ${fieldErrors.trim()}`;
      }
    }
  }

  // 10. Status or statusText fields
  if (typeof object["statusText"] === "string" && object["statusText"].trim()) {
    return object["statusText"].trim();
  }

  // 11. Title field (OpenAPI/Swagger common pattern)
  if (typeof object["title"] === "string" && object["title"].trim()) {
    return object["title"].trim();
  }

  // 12. Recursive search in nested objects (limited depth)
  if (maxDepth > 1) {
    for (const [, value] of Object.entries(object)) {
      if (typeof value === "object" && value !== null && !Array.isArray(value)) {
        const nested = extractMessage(value, customExtractors, maxDepth - 1);
        if (nested) {
          return nested;
        }
      }
    }
  }

  return undefined;
}

/**
 * Extracts error code from response data
 */
function extractCode(
  data: unknown,
  customExtractors: CodeExtractor[] = [],
  maxDepth = 5,
): string | number | undefined {
  if (maxDepth <= 0 || data == null) {
    return undefined;
  }

  // Try custom extractors first
  for (const extractor of customExtractors) {
    try {
      const result = extractor(data);
      if (result !== undefined) {
        return result;
      }
    } catch {
      // Ignore extractor errors, try next one
    }
  }

  // Handle non-objects
  if (typeof data !== "object" || data === null) {
    return;
  }

  const object = data as Record<string, unknown>;

  // Standard code patterns

  // 1. Direct code field
  if (
    (typeof object["code"] === "string" && object["code"].trim()) ||
    typeof object["code"] === "number"
  ) {
    return object["code"];
  }

  // 2. Error code
  if (
    (typeof object["errorCode"] === "string" && object["errorCode"].trim()) ||
    typeof object["errorCode"] === "number"
  ) {
    return object["errorCode"];
  }

  // 3. Error object with code
  if (typeof object["error"] === "object" && object["error"] !== null) {
    const errorObject = object["error"] as Record<string, unknown>;
    if (
      (typeof errorObject["code"] === "string" && errorObject["code"].trim()) ||
      typeof errorObject["code"] === "number"
    ) {
      return errorObject["code"];
    }
  }

  // 4. GraphQL errors array
  if (Array.isArray(object["errors"]) && object["errors"].length > 0) {
    const firstError = object["errors"][0];
    if (typeof firstError === "object" && firstError !== null) {
      const errorObject = firstError as Record<string, unknown>;

      if (
        (typeof errorObject["code"] === "string" && errorObject["code"].trim()) ||
        typeof errorObject["code"] === "number"
      ) {
        return errorObject["code"];
      }

      // GraphQL extensions.code pattern
      if (typeof errorObject["extensions"] === "object" && errorObject["extensions"] !== null) {
        const extensions = errorObject["extensions"] as Record<string, unknown>;
        if (
          (typeof extensions["code"] === "string" && extensions["code"].trim()) ||
          typeof extensions["code"] === "number"
        ) {
          return extensions["code"];
        }
      }
    }
  }

  // 5. Status code (if different from HTTP status)
  if (
    (typeof object["statusCode"] === "string" && object["statusCode"].trim()) ||
    typeof object["statusCode"] === "number"
  ) {
    return object["statusCode"];
  }

  // 6. JSON:API errors structure
  if (Array.isArray(object["errors"]) && object["errors"].length > 0) {
    const firstError = object["errors"][0];
    if (typeof firstError === "object" && firstError !== null) {
      const errorObject = firstError as Record<string, unknown>;

      if (
        (typeof errorObject["code"] === "string" && errorObject["code"].trim()) ||
        typeof errorObject["code"] === "number"
      ) {
        return errorObject["code"];
      }

      if (
        (typeof errorObject["status"] === "string" && errorObject["status"].trim()) ||
        typeof errorObject["status"] === "number"
      ) {
        return errorObject["status"];
      }
    }
  }

  // 7. Type field (sometimes used as error classification)
  if (typeof object["type"] === "string" && object["type"].trim()) {
    return object["type"].trim();
  }

  return undefined;
}

/**
 * Extracts additional error details for debugging and logging
 */
function extractAdditionalDetails(data: unknown, maxDepth = 5): unknown {
  if (maxDepth <= 0 || data == null) {
    return undefined;
  }

  if (typeof data !== "object") {
    return data;
  }

  const object = data as Record<string, unknown>;
  const details: Record<string, unknown> = {};

  // Extract commonly useful fields
  const interestingFields = [
    "timestamp",
    "traceId",
    "requestId",
    "correlationId",
    "path",
    "method",
    "details",
    "context",
    "metadata",
    "source",
    "cause",
    "innerError",
    "stackTrace",
  ];

  for (const field of interestingFields) {
    if (object[field] !== undefined) {
      details[field] = object[field];
    }
  }

  // Include validation errors structure if present
  if (typeof object["errors"] === "object" && object["errors"] !== null) {
    details["validationErrors"] = object["errors"];
  }

  return Object.keys(details).length > 0 ? details : undefined;
}

/**
 * Built-in message extractors for common API standards
 */
export const builtInMessageExtractors: Record<string, MessageExtractor> = {
  /**
   * RFC 7807 Problem Details for HTTP APIs
   */
  rfc7807: (data) => {
    if (typeof data === "object" && data !== null) {
      const object = data as Record<string, unknown>;
      if (typeof object["detail"] === "string") {
        return object["detail"];
      }

      if (typeof object["title"] === "string") {
        return object["title"];
      }
    }
  },

  /**
   * Spring Boot default error response
   */
  springBoot: (data) => {
    if (typeof data === "object" && data !== null) {
      const object = data as Record<string, unknown>;
      if (typeof object["message"] === "string") {
        return object["message"];
      }

      if (typeof object["error"] === "string") {
        return object["error"];
      }
    }
  },

  /**
   * Express.js/Node.js common error patterns
   */
  express: (data) => {
    if (typeof data === "object" && data !== null) {
      const object = data as Record<string, unknown>;
      if (typeof object["message"] === "string") {
        return object["message"];
      }

      if (typeof object["error"] === "string") {
        return object["error"];
      }
    }
  },
};

/**
 * Built-in code extractors for common API standards
 */
export const builtInCodeExtractors: Record<string, CodeExtractor> = {
  /**
   * RFC 7807 Problem Details for HTTP APIs
   */
  rfc7807: (data) => {
    if (typeof data === "object" && data !== null) {
      const object = data as Record<string, unknown>;
      if (typeof object["type"] === "string") {
        return object["type"];
      }
    }
  },

  /**
   * GraphQL standard error extensions
   */
  graphql: (data) => {
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
  },
};

/* eslint-enable @typescript-eslint/no-unsafe-assignment, consistent-return, no-eq-null, complexity, sonarjs/cognitive-complexity */
