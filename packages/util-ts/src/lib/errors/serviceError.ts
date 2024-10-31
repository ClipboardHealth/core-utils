import { randomUUID } from "node:crypto";

import { deepFreeze } from "../deepFreeze";
import { isDefined } from "../nullish/isDefined";
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

export type ServiceErrorParams =
  // Message string
  | string
  // Array of issues with optional cause
  | { cause?: Readonly<unknown>; issues: readonly ServiceIssue[] };

export interface ZodLike {
  issues: ReadonlyArray<{
    message?: string | undefined;
    path: Array<string | number>;
  }>;
}

const ERROR_METADATA: Record<ErrorCode, { status: number; title: string }> = {
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
};

interface Issue extends ServiceIssue {
  code: Required<ServiceIssue>["code"];
  title: string;
}

function isZodLike(value: unknown): value is ZodLike {
  const zodLike = value as ZodLike | undefined;

  return (
    isDefined(zodLike) &&
    "issues" in zodLike &&
    Array.isArray(zodLike.issues) &&
    zodLike.issues.every(
      (issue) =>
        typeof issue === "object" &&
        isDefined(issue) &&
        "path" in issue &&
        Array.isArray(issue.path),
    )
  );
}

/**
 * Error class for service-level errors, convertible to JSON:API errors.
 */
export class ServiceError extends Error {
  /**
   * Converts an error to a `ServiceError`.
   *
   * @param value - The value to convert, which can be any type
   * @returns If the value is already a `ServiceError`, returns it unchanged. Otherwise, convert it
   *          to a `ServiceError`.
   */
  static fromError(value: unknown): ServiceError {
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
   * Converts a Zod-like error to a `ServiceError`.
   *
   * @param value - An object with a Zod-like error structure containing issues
   * @returns The converted `ServiceError`
   * @throws {ServiceError} If the provided value does not match the expected Zod-like structure
   */
  static fromZodLike(value: ZodLike): ServiceError {
    if (!isZodLike(value)) {
      throw new ServiceError({
        issues: [{ code: ERROR_CODES.internal, message: "Invalid ZodLike" }],
        cause: value,
      });
    }

    return new ServiceError({
      issues: value.issues.map((issue) => ({
        code: ERROR_CODES.unprocessableEntity,
        message: issue.message,
        path: issue.path,
      })),
      cause: value,
    });
  }

  readonly id: string;
  readonly issues: readonly Issue[];

  /**
   * Creates a new `ServiceError`
   * @param parameters - Issues contributing to the error or a message string
   */
  constructor(parameters: ServiceErrorParams) {
    const params =
      typeof parameters === "string"
        ? { issues: [toIssue({ message: parameters })] }
        : { ...parameters, issues: parameters.issues.map(toIssue) };
    super(createServiceErrorMessage(params.issues));

    this.id = randomUUID();
    this.issues = deepFreeze(params.issues);
    this.cause = "cause" in params ? params.cause : undefined;
    this.name = this.constructor.name;

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
    const cause = this.cause ? `; [cause]: ${toError(this.cause).toString()}` : "";
    return `${this.name}[${this.id}]: ${this.message}${cause}`;
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
            pointer: `/${issue.path.join("/")}`,
          },
        }),
      })),
    };
  }
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