import { either as E } from "@clipboard-health/util-ts";
import { type SafeParseReturnType } from "zod";

import { ServiceError, type ServiceErrorParams } from "../errors/serviceError";

/**
 * Represents the result of a service operation that may fail.
 * @template A The type of the successful result value
 */
export type ServiceResult<A> = E.Either<ServiceError, A>;

/**
 * Alias for {@link E.right}
 */
export function success<A>(value: A): ServiceResult<A> {
  return E.right(value);
}

/**
 * Alias for {@link E.left}
 */
export function failure<A = never>(params: ServiceErrorParams | ServiceError): ServiceResult<A> {
  return E.left(params instanceof ServiceError ? params : new ServiceError(params));
}

/**
 * Alias for {@link E.isLeft}
 */
export function isFailure<A>(result: ServiceResult<A>): result is E.Left<ServiceError> {
  return E.isLeft(result);
}

/**
 * Alias for {@link E.isRight}
 */
export function isSuccess<A>(result: ServiceResult<A>): result is E.Right<A> {
  return E.isRight(result);
}

/**
 * Alias for {@link E.mapLeft}
 */
export function mapFailure<G>(
  f: (left: ServiceError) => G,
): <A>(result: ServiceResult<A>) => E.Either<G, A> {
  return E.mapLeft(f);
}

/**
 * Converts a promise returning function into a ServiceResult by handling potential rejections.
 * If the promise returning function resolves successfully, returns a success ServiceResult.
 * If the promise rejects, calls the onError function to convert the error into a ServiceError.
 *
 * @template A The type of the value the promise resolves to
 * @param f The promise returning function to convert (a function catches sync throws)
 * @param onError Function to convert unknown errors into ServiceError
 * @returns A promise that resolves to a ServiceResult<A>
 *
 * @example
 * <embedex source="packages/util-ts/examples/tryCatchAsync.ts">
 *
 * ```ts
 * import { ok, strictEqual } from "node:assert/strict";
 *
 * import { isFailure, isSuccess, ServiceError, tryCatchAsync } from "@clipboard-health/util-ts";
 *
 * async function example() {
 *   const successResult = await tryCatchAsync(
 *     async () => {
 *       const response = await fetch("https://jsonplaceholder.typicode.com/posts/1");
 *       return (await response.json()) as { id: number };
 *     },
 *     (error) => new ServiceError(`Failed to fetch: ${String(error)}`),
 *   );
 *
 *   ok(isSuccess(successResult));
 *   strictEqual(successResult.right.id, 1);
 *
 *   const failureResult = await tryCatchAsync(
 *     async () => await Promise.reject(new Error("Network error")),
 *     (error) => new ServiceError(`Failed to fetch: ${String(error)}`),
 *   );
 *
 *   ok(isFailure(failureResult));
 *   strictEqual(failureResult.left.issues[0]?.message, "Failed to fetch: Error: Network error");
 * }
 *
 * // eslint-disable-next-line unicorn/prefer-top-level-await
 * void example();
 * ```
 *
 * </embedex>
 */
export async function tryCatchAsync<A>(
  f: () => Promise<A>,
  onError: (error: unknown) => ServiceError,
): Promise<ServiceResult<A>> {
  try {
    return success(await f());
  } catch (error) {
    return handleError(error, onError);
  }
}

/**
 * Wraps a synchronous function that might throw into a ServiceResult.
 * If the function executes successfully, returns a success ServiceResult.
 * If the function throws, calls the onError function to convert the error into a ServiceError.
 *
 * @template A The return type of the function
 * @param f The function to execute safely
 * @param onError Function to convert unknown errors into ServiceError
 * @returns A ServiceResult<A>
 *
 * @example
 * <embedex source="packages/util-ts/examples/tryCatch.ts">
 *
 * ```ts
 * import { ok, strictEqual } from "node:assert/strict";
 *
 * import { isFailure, isSuccess, parseJson, ServiceError, tryCatch } from "@clipboard-health/util-ts";
 *
 * const successResult = tryCatch(
 *   () => parseJson<{ name: string }>('{"name": "John"}'),
 *   (error) => new ServiceError(`Parse error: ${String(error)}`),
 * );
 *
 * ok(isSuccess(successResult));
 * strictEqual(successResult.right.name, "John");
 *
 * const failureResult = tryCatch(
 *   () => parseJson("invalid json"),
 *   (error) => new ServiceError(`Parse error: ${String(error)}`),
 * );
 *
 * ok(isFailure(failureResult));
 * ok(failureResult.left.issues[0]?.message?.includes("Parse error"));
 * ```
 *
 * </embedex>
 */
export function tryCatch<A>(
  f: () => A,
  onError: (error: unknown) => ServiceError,
): ServiceResult<A> {
  try {
    return success(f());
  } catch (error) {
    return handleError(error, onError);
  }
}

/**
 * Converts a Zod SafeParseReturnType into a ServiceResult.
 * If the parse was successful, returns a success ServiceResult with the parsed data.
 * If the parse failed, returns a failure ServiceResult with the validation errors.
 *
 * @template A The type of the successfully parsed value
 * @param value The SafeParseReturnType from a Zod schema parse
 * @returns A ServiceResult<A>
 *
 * @example
 * <embedex source="packages/util-ts/examples/fromSafeParseReturnType.ts">
 *
 * ```ts
 * import { ok, strictEqual } from "node:assert/strict";
 *
 * import { fromSafeParseReturnType, isFailure, isSuccess } from "@clipboard-health/util-ts";
 * import { z } from "zod";
 *
 * const schema = z.object({ name: z.string(), age: z.number() });
 *
 * const validData = { name: "John", age: 30 };
 * const successResult = fromSafeParseReturnType(schema.safeParse(validData));
 *
 * ok(isSuccess(successResult));
 * strictEqual(successResult.right.name, "John");
 *
 * const invalidData = { name: "John", age: "thirty" };
 * const failureResult = fromSafeParseReturnType(schema.safeParse(invalidData));
 *
 * ok(isFailure(failureResult));
 * ok(failureResult.left.issues.length > 0);
 * ```
 *
 * </embedex>
 */
export function fromSafeParseReturnType<A>(
  value: SafeParseReturnType<unknown, A>,
): ServiceResult<A> {
  return value.success ? success(value.data) : failure(ServiceError.fromZodError(value.error));
}

/**
 * Handles possible throws in onError functions.
 */
function handleError<A>(
  error: unknown,
  onError: (error: unknown) => ServiceError,
): ServiceResult<A> {
  try {
    return failure(onError(error));
  } catch {
    return failure(ServiceError.fromUnknown(error));
  }
}
