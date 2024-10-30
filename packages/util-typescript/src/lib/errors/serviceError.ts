import { randomUUID } from "node:crypto";

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
  code: ErrorCode;

  /** Optional human-readable title. A default title is provided if not specified. */
  title?: string;

  /** Optional specific details about what caused the issue */
  detail?: string;

  /** Optional path to the issue location */
  path?: Array<string | number>;
}

export interface ServiceErrorParams {
  issues: readonly ServiceIssue[];
  cause?: Readonly<unknown>;
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

/**
 * Error class for service-level errors, convertible to JSON:API errors. Contain one or more issues
 * with standardized error codes.
 */
export class ServiceError extends Error {
  readonly id: string;
  readonly issues: readonly ServiceIssue[];

  /**
   * Creates a new ServiceError
   * @param params.issues - Array of issues contributing to the error
   * @param params.cause - Optional underlying cause
   */
  constructor(params: ServiceErrorParams) {
    const { cause, issues } = params;
    super(createServiceErrorMessage(issues));

    this.id = randomUUID();
    this.issues = deepFreeze(
      issues.map((issue) => ({ ...issue, title: issue.title ?? ERROR_METADATA[issue.code].title })),
    );
    this.cause = cause;
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
        ...(issue.detail && { detail: issue.detail }),
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
function createServiceErrorMessage(issues: readonly ServiceIssue[]): string {
  if (issues.length === 0) {
    return "[internal]: An unknown error occurred";
  }

  return issues
    .map((issue) => {
      const detail = issue.detail ?? issue.title;
      const detailString = detail ? `: ${detail}` : "";
      return `[${issue.code}]${detailString}`;
    })
    .join("; ");
}
