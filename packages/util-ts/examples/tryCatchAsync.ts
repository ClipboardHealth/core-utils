// packages/util-ts/src/lib/functional/serviceResult.ts,packages/util-ts/README.md
import { ok, strictEqual } from "node:assert/strict";

import { isFailure, isSuccess, ServiceError, tryCatchAsync } from "@clipboard-health/util-ts";

async function example() {
  const successResult = await tryCatchAsync(
    async () => {
      const response = await fetch("https://jsonplaceholder.typicode.com/posts/1");
      return (await response.json()) as { id: number };
    },
    (error) => new ServiceError(`Failed to fetch: ${String(error)}`),
  );

  ok(isSuccess(successResult));
  strictEqual(successResult.value.id, 1);

  const failureResult = await tryCatchAsync(
    async () => await Promise.reject(new Error("Network error")),
    (error) => new ServiceError(`Failed to fetch: ${String(error)}`),
  );

  ok(isFailure(failureResult));
  strictEqual(failureResult.error.issues[0]?.message, "Failed to fetch: Error: Network error");
}

// eslint-disable-next-line unicorn/prefer-top-level-await
void example();
