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
export function expectToBeFailure<A>(
  value: ServiceResult<A> | undefined,
): asserts value is E.Left<ServiceError> & Failure<ServiceError> {
  expectToBeLeft(value);
  ok(isFailure(value));
}
