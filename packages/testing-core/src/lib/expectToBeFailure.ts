import { ok } from "node:assert/strict";

import { isFailure } from "@clipboard-health/util-ts";
import type { either as E, Failure, ServiceError, ServiceResult } from "@clipboard-health/util-ts";

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
