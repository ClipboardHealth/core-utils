import { ok } from "node:assert/strict";

import {
  type either as E,
  isSuccess,
  type ServiceResult,
  type Success,
} from "@clipboard-health/util-ts";

import { expectToBeRight } from "./expectToBeRight";

/**
 * Alias for {@link expectToBeRight}
 */
export function expectToBeSuccess<A>(
  value: ServiceResult<A> | undefined,
): asserts value is E.Right<A> & Success<A> {
  expectToBeRight(value);
  ok(isSuccess(value));
}
