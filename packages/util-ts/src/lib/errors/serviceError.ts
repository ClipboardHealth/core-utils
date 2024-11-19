import { randomUUID } from "node:crypto";

import { type ZodError, type ZodIssue } from "zod";

import { deepFreeze } from "../deepFreeze";
import { toError } from "./toError";

/**
 * Standard error codes used across microservices.
 */
export const ERROR_CODES = {
  badRequest: "badRequest",
  unauthorized: "unauthorized",
  forbidden: "forbidden",
  notFound: "notFound",
  conflict: "conflict",
  unprocessableEntity: "unprocessableEntity",
  tooManyRequests: "tooManyRequests",
  internal: "internal",
} as const;

export type ErrorCode = (typeof ERROR_CODES)[keyof typeof ERROR_CODES];

export interface ServiceIssue {
  /** Standardized {@link ERROR_CODES} */
  code?: ErrorCode;

  /** Details about what caused the issue */
  message?: string | undefined;

  /** Path to issue location */
  path?: Array<string | number>;
}

export type ErrorSource = "header" | "parameter" | "pointer";

export type ServiceErrorParams =
  // Message string
  | string
  | {
      /** Error cause */
      cause?: unknown;
      /** Unique identifier for the issue */
      id?: string;
      /** Array of issues contributing to the error */
      issues: readonly ServiceIssue[];
      /**
       * Source of the error
       *
       * @see {@link https://jsonapi.org/format/#error-objects}
       */
      source?: ErrorSource | undefined;
    };

const ERROR_METADATA = {
  badRequest: {
    status: 400,
    title: "Invalid or malformed request",
  },
  unauthorized: {
    status: 401,
    title: "Invalid or missing credentials",
  },
  forbidden: {
    status: 403,
    title: "Access to resource denied",
  },
  notFound: {
    status: 404,
    title: "Resource not found",
  },
  conflict: {
    status: 409,
    title: "Conflict with server state",
  },
  unprocessableEntity: {
    status: 422,
    title: "Request failed validation",
  },
  tooManyRequests: {
    status: 429,
    title: "Request limit exceeded",
  },
  internal: {
    status: 500,
    title: "Internal server error",
  },
} as const satisfies Record<ErrorCode, { status: number; title: string }>;
type Status = (typeof ERROR_METADATA)[keyof typeof ERROR_METADATA]["status"];

export interface Issue extends ServiceIssue {
  code: Required<ServiceIssue>["code"];
  title: string;
}

/**
 * Error class for service-level errors, convertible to JSON:API errors.
 */
export class ServiceError extends Error {
  /**
   * Converts an unknown value to a `ServiceError`. Typically called from `catch` blocks.
   *
   * @param value - The value to convert, which can be any type
   * @returns If the value is already a `ServiceError`, returns it unchanged. Otherwise, convert it
   *          to a `ServiceError`.
   */
  static fromUnknown(value: unknown): ServiceError {
    if (value instanceof ServiceError) {
      return value;
    }

    const error = toError(value);
    return new ServiceError({
      issues: [{ code: ERROR_CODES.internal, message: error.message }],
      cause: error,
    });
  }

  /**
   * Converts a ZodError to a `ServiceError`.
   *
   * @param error - A ZodError
   * @returns The converted `ServiceError`
   */
  static fromZodError(error: ZodError, options?: { source?: ErrorSource }): ServiceError {
    return new ServiceError({
      cause: error,
      issues: error.issues.map(toZodIssue),
      source: options?.source,
    });
  }

  readonly id: string;
  readonly issues: readonly Issue[];
  readonly status: Status;
  readonly source: ErrorSource;

  /**
   * Creates a new `ServiceError`
   * @param parameters - Issues contributing to the error or a message string
   */
  constructor(parameters: ServiceErrorParams) {
    const params =
      typeof parameters === "string"
        ? {
            cause: undefined,
            id: undefined,
            issues: [toIssue({ message: parameters })],
            source: undefined,
          }
        : { ...parameters, issues: parameters.issues.map(toIssue) };
    super(createServiceErrorMessage(params.issues));

    const { cause, id, issues, source } = params;
    this.cause = cause;
    this.id = id ?? randomUUID();
    this.issues = deepFreeze(issues);
    this.name = this.constructor.name;
    this.source = source ?? "pointer";
    this.status = Math.max(...issues.map((issue) => ERROR_METADATA[issue.code].status)) as Status;

    /**
     * Maintain proper prototype chain in transpiled code
     * @see {@link https://www.typescriptlang.org/docs/handbook/release-notes/typescript-2-2.html#support-for-newtarget}
     */
    Object.setPrototypeOf(this, new.target.prototype);
  }

  /**
   * Return string representation of the error for logging.
   */
  override toString(): string {
    return `${this.name}[${this.id}]: ${this.message}`;
  }

  /**
   * Converts the error to JSON:API format
   * @see {@link https://jsonapi.org/format/#error-objects}
   * @returns Object conforming to JSON:API error format
   */
  toJsonApi() {
    return {
      errors: this.issues.map((issue) => ({
        id: this.id,
        status: String(ERROR_METADATA[issue.code].status),
        code: issue.code,
        title: issue.title,
        ...(issue.message && { detail: issue.message }),
        ...(issue.path && {
          source: {
            [this.source]: `/${issue.path.join("/")}`,
          },
        }),
      })),
    };
  }
}

export function toZodIssue(issue: ZodIssue): ServiceIssue {
  return {
    code: ERROR_CODES.unprocessableEntity,
    message: issue.message,
    path: issue.path,
  };
}

/**
 * Creates a human-readable error message from an array of service issues
 * @param issues - Array of issues to include in the message
 * @returns Message string in format "[code1]: detail1; [code2]: detail2"
 */
function createServiceErrorMessage(issues: readonly Issue[]): string {
  if (issues.length === 0) {
    return "[unknown]";
  }

  return issues
    .map((issue) => {
      const message = issue.message ? `: ${issue.message}` : "";
      return `[${issue.code}]${message}`;
    })
    .join("; ");
}

function toIssue(issue: ServiceIssue): Issue {
  const code = issue.code ?? ERROR_CODES.internal;
  return { ...issue, code, title: ERROR_METADATA[code].title };
}
