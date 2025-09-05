// packages/util-ts/src/lib/functional/serviceResult.ts,packages/util-ts/README.md
import { equal, ok } from "node:assert/strict";

import {
  either as E,
  failure,
  ServiceError,
  type ServiceResult,
  success,
  tryCatchAsync,
} from "@clipboard-health/util-ts";

async function getJson(url: string): Promise<ServiceResult<unknown>> {
  const response = await fetch(url);
  if (!response.ok) {
    return failure({ issues: [{ code: "badStatus", message: response.status.toString() }] });
  }

  return success(await response.json());
}

async function example() {
  const successResult = await tryCatchAsync(
    getJson("https://jsonplaceholder.typicode.com/posts/1"),
    (error) => new ServiceError(`Failed to fetch: ${String(error)}`),
  );

  ok(E.isRight(successResult));
  equal(successResult.right, "data");

  const failureResult = await tryCatchAsync(
    Promise.reject(new Error("Network error")),
    (error) => new ServiceError(`Failed to fetch: ${String(error)}`),
  );

  ok(E.isLeft(failureResult));
  equal(failureResult.left.issues[0]?.message, "Failed to fetch: Error: Network error");
}

// eslint-disable-next-line unicorn/prefer-top-level-await
void example();
