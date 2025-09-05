// packages/util-ts/src/lib/functional/serviceResult.ts,packages/util-ts/README.md
import { equal, ok } from "node:assert/strict";

import { isFailure, isSuccess, parseJson, ServiceError, tryCatch } from "@clipboard-health/util-ts";

const successResult = tryCatch(
  () => parseJson<{ name: string }>('{"name": "John"}'),
  (error) => new ServiceError(`Parse error: ${String(error)}`),
);

ok(isSuccess(successResult));
equal(successResult.right.name, "John");

const failureResult = tryCatch(
  () => parseJson("invalid json"),
  (error) => new ServiceError(`Parse error: ${String(error)}`),
);

ok(isFailure(failureResult));
ok(failureResult.left.issues[0]?.message?.includes("Parse error"));
