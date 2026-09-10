import { ok } from "node:assert/strict";

import {
  type either as E,
  isSuccess,
  type ServiceError,
  type ServiceResult,
  type Success,
} from "@clipboard-health/util-ts";

import { expectToBeRight } from "./expectToBeRight";

/**
 * Alias for {@link expectToBeRight}
 */
export function expectToBeSuccess<A, ErrorType extends ServiceError = ServiceError>(
  value: ServiceResult<A, ErrorType> | undefined,
): asserts value is E.Right<A> & Success<A> {
  expectToBeRight(value);
  ok(isSuccess(value), "Expected Success, got Failure");
}
