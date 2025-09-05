// packages/util-ts/src/lib/functional/serviceResult.ts,packages/util-ts/README.md
import { equal, ok } from "node:assert/strict";

import { either as E, failure, mapFailure, ServiceError, success } from "@clipboard-health/util-ts";

const transformError = mapFailure(
  (error: ServiceError) => `Transformed: ${error.issues[0]?.message}`,
);

const failureResult = failure(new ServiceError("Original error"));
const transformedFailure = transformError(failureResult);

ok(E.isLeft(transformedFailure));
equal(transformedFailure.left, "Transformed: Original error");

const successResult = success("data");
const transformedSuccess = transformError(successResult);

ok(E.isRight(transformedSuccess));
equal(transformedSuccess.right, "data");
