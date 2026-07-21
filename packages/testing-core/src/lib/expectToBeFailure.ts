import { ok } from "node:assert/strict";

import {
  type either as E,
  type Failure,
  isFailure,
  type ServiceError,
  type ServiceResult,
} from "@clipboard-health/util-ts";

import { expectToBeLeft } from "./expectToBeLeft";

/**
 * Alias for {@link expectToBeLeft}
 */
export function expectToBeFailure<A, ErrorType extends ServiceError>(
  value: ServiceResult<A, ErrorType> | undefined,
): asserts value is E.Left<ErrorType> & Failure<ErrorType> {
  expectToBeLeft(value);
  ok(isFailure(value), "Expected Failure, got Success");
}
