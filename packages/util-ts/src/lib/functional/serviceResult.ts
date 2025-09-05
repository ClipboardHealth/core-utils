import { either as E } from "@clipboard-health/util-ts";
import { type SafeParseReturnType } from "zod";

import { ServiceError, type ServiceErrorParams } from "../errors/serviceError";

/**
 * Represents the result of a service operation that may fail.
 * @template A The type of the successful result value
 */
export type ServiceResult<A> = E.Either<ServiceError, A>;

/**
 * Creates a successful `ServiceResult` containing the provided value.
 *
 * @template A The type of the success value
 * @param value The value to wrap in a successful result
 * @returns A `ServiceResult` containing the success value
 *
 * @example
 * <embedex source="packages/util-ts/examples/success.ts">
 *
 * ```ts
 * import { equal, ok } from "node:assert/strict";
 *
 * import { either as E, success } from "@clipboard-health/util-ts";
 *
 * const result = success("Hello, World!");
 *
 * ok(E.isRight(result));
 * equal(result.right, "Hello, World!");
 * ```
 *
 * </embedex>
 */
export function success<A>(value: A): ServiceResult<A> {
  return E.right(value);
}

/**
 * Creates a failed `ServiceResult` containing a `ServiceError`.
 *
 * @template A The type of the success value
 * @param params The parameters to create the `ServiceError`
 * @returns A `ServiceResult` containing the error
 *
 * @example
 * <embedex source="packages/util-ts/examples/failure.ts">
 *
 * ```ts
 * import { equal, ok } from "node:assert/strict";
 *
 * import { ERROR_CODES, failure, isFailure } from "@clipboard-health/util-ts";
 *
 * const result = failure({
 *   issues: [{ code: ERROR_CODES.notFound, message: "User not found" }],
 * });
 *
 * ok(isFailure(result));
 * equal(result.left.issues[0]?.message, "User not found");
 * ```
 *
 * </embedex>
 */
export function failure<A = never>(params: ServiceErrorParams | ServiceError): ServiceResult<A> {
  return E.left(params instanceof ServiceError ? params : new ServiceError(params));
}

/**
 * Type guard that checks if a `ServiceResult` is failure.
 *
 * @param result - The `ServiceResult` to check
 * @returns `true` if the `ServiceResult` is failure, `false` if it is success
 */
export function isFailure<A>(result: ServiceResult<A>): result is E.Left<ServiceError> {
  return E.isLeft(result);
}

/**
 * Type guard that checks if a `ServiceResult` is success.
 *
 * @param result - The `ServiceResult` to check
 * @returns `true` if the `ServiceResult` is success, `false` if it is failure
 */
export function isSuccess<A>(result: ServiceResult<A>): result is E.Right<A> {
  return E.isRight(result);
}

/**
 * Transforms the error inside a `ServiceResult` using the provided function. If the `ServiceResult` is
 * failure, returns failure with the transformed error. If the `ServiceResult` is success, returns
 * the success unchanged.
 *
 * @template G The type of the transformed error
 * @param f Function that transforms a ServiceError into type G
 * @returns A function that takes a ServiceResult<A> and returns Either<G, A>
 *
 * @example
 * <embedex source="packages/util-ts/examples/mapFailure.ts">
 *
 * ```ts
 * import { equal, ok } from "node:assert/strict";
 *
 * import { either as E, failure, mapFailure, ServiceError, success } from "@clipboard-health/util-ts";
 *
 * const transformError = mapFailure(
 *   (error: ServiceError) => `Transformed: ${error.issues[0]?.message}`,
 * );
 *
 * const failureResult = failure(new ServiceError("Original error"));
 * const transformedFailure = transformError(failureResult);
 *
 * ok(E.isLeft(transformedFailure));
 * equal(transformedFailure.left, "Transformed: Original error");
 *
 * const successResult = success("data");
 * const transformedSuccess = transformError(successResult);
 *
 * ok(E.isRight(transformedSuccess));
 * equal(transformedSuccess.right, "data");
 * ```
 *
 * </embedex>
 */
export function mapFailure<G>(
  f: (left: ServiceError) => G,
): <A>(result: ServiceResult<A>) => E.Either<G, A> {
  return (result) => (isFailure(result) ? E.left(f(result.left)) : result);
}

/**
 * Converts a Promise into a ServiceResult by handling potential rejections.
 * If the promise resolves successfully, returns a success ServiceResult.
 * If the promise rejects, calls the onError function to convert the error into a ServiceError.
 *
 * @template A The type of the value the promise resolves to
 * @param f The promise returning function to convert
 * @param onError Function to convert unknown errors into ServiceError
 * @returns A promise that resolves to a ServiceResult<A>
 *
 * @example
 * <embedex source="packages/util-ts/examples/tryCatchAsync.ts">
 *
 * ```ts
 * import { equal, ok } from "node:assert/strict";
 *
 * import { isFailure, isSuccess, ServiceError, tryCatchAsync } from "@clipboard-health/util-ts";
 *
 * async function fetchJson() {
 *   const response = await fetch("https://jsonplaceholder.typicode.com/posts/1");
 *   return (await response.json()) as { id: number };
 * }
 *
 * async function example() {
 *   const successResult = await tryCatchAsync(
 *     fetchJson(),
 *     (error) => new ServiceError(`Failed to fetch: ${String(error)}`),
 *   );
 *
 *   ok(isSuccess(successResult));
 *   equal(successResult.right.id, 1);
 *
 *   const failureResult = await tryCatchAsync(
 *     Promise.reject(new Error("Network error")),
 *     (error) => new ServiceError(`Failed to fetch: ${String(error)}`),
 *   );
 *
 *   ok(isFailure(failureResult));
 *   equal(failureResult.left.issues[0]?.message, "Failed to fetch: Error: Network error");
 * }
 *
 * // eslint-disable-next-line unicorn/prefer-top-level-await
 * void example();
 * ```
 *
 * </embedex>
 */
export async function tryCatchAsync<A>(
  f: Promise<A> | (() => Promise<A>),
  onError: (error: unknown) => ServiceError,
): Promise<ServiceResult<A>> {
  try {
    return success(await (typeof f === "function" ? f() : f));
  } catch (error) {
    return failure(onError(error));
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
 * import { equal, ok } from "node:assert/strict";
 *
 * import { isFailure, isSuccess, parseJson, ServiceError, tryCatch } from "@clipboard-health/util-ts";
 *
 * const successResult = tryCatch(
 *   () => parseJson<{ name: string }>('{"name": "John"}'),
 *   (error) => new ServiceError(`Parse error: ${String(error)}`),
 * );
 *
 * ok(isSuccess(successResult));
 * equal(successResult.right.name, "John");
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
    return failure(onError(error));
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
 * import { equal, ok } from "node:assert/strict";
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
 * equal(successResult.right.name, "John");
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
