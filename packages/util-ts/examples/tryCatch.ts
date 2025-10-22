// embedex: packages/util-ts/src/lib/functional/serviceResult.ts,packages/util-ts/README.md
import { ok, strictEqual } from "node:assert/strict";

import { isFailure, isSuccess, parseJson, ServiceError, tryCatch } from "@clipboard-health/util-ts";

const successResult = tryCatch(
  () => parseJson<{ name: string }>('{"name": "John"}'),
  (error) => new ServiceError(`Parse error: ${String(error)}`),
);

ok(isSuccess(successResult));
strictEqual(successResult.value.name, "John");

const failureResult = tryCatch(
  () => parseJson("invalid json"),
  (error) => new ServiceError(`Parse error: ${String(error)}`),
);

ok(isFailure(failureResult));
ok(failureResult.error.issues[0]?.message?.includes("Parse error"));
