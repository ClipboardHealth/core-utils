/* eslint-disable sonarjs/deprecation */
import { type Arrayable } from "type-fest";

import * as E from "../functional/either";

/**
 * Error status codes in our service APIs.
 *
 * @see {@link https://www.notion.so/BP-REST-API-f769b7fe745c4cf38f6eca2e9ad8a843?pvs=4#e0b4e9ea30f041409ce39505650098ea}
 */
export const ERROR_STATUS_CODES = [400, 401, 403, 404, 409, 422, 429, 500] as const;

/**
 * @deprecated Use {@link ErrorCode} instead.
 */
export type ErrorStatusCode = (typeof ERROR_STATUS_CODES)[number];

/**
 * @deprecated Use {@link ServiceIssue} instead.
 */
export interface CbhIssue {
  cause?: Error;
  id?: string;
  message: string;
  statusCode?: ErrorStatusCode;
}

/**
 * @deprecated Use {@link ServiceError} instead.
 */
export class CbhError extends Error {
  public readonly issues: readonly CbhIssue[];

  constructor(messageOrIssues: Arrayable<CbhIssue> | string) {
    const is: readonly CbhIssue[] = getMessageOrIssues(messageOrIssues);

    const first = is[0] ?? { message: "Unknown error" };
    super(first?.message, { cause: "cause" in first ? first.cause : undefined });
    // See https://www.typescriptlang.org/docs/handbook/release-notes/typescript-2-2.html#example
    Object.setPrototypeOf(this, new.target.prototype);

    this.issues = is;
    this.name = "CbhError";
  }
}

/**
 * @deprecated Use {@link failure} instead.
 */
export function toLeft<A = never>(issues: Arrayable<CbhIssue> | string): E.Either<CbhError, A> {
  return E.left(new CbhError(issues));
}

function getMessageOrIssues(messageOrIssues: string | Arrayable<CbhIssue>): readonly CbhIssue[] {
  if (typeof messageOrIssues === "string") {
    return [{ message: messageOrIssues }];
  }

  if (Array.isArray(messageOrIssues)) {
    return messageOrIssues;
  }

  return [messageOrIssues];
}
/* eslint-enable sonarjs/deprecation */
