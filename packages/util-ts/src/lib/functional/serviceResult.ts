import { type SafeParseReturnType } from "zod";

import { ServiceError, type ServiceErrorParams } from "../errors/serviceError";
import { type Either, type Left, mapLeft, type Right } from "./either";

export interface Success<A> {
  readonly isSuccess: true;
  readonly value: A;
}

export interface Failure<E> {
  readonly isSuccess: false;
  readonly error: E;
}

/**
 * Represents the result of a service operation that may fail.
 *
 * The type is also an {@link Either}, allowing functions built for {@link Either}.
 *
 * @template A The type of the successful result value
 */
export type ServiceResult<A> =
  | (Right<A> & Success<A>)
  | (Left<ServiceError> & Failure<ServiceError>);

/**
 * Creates a successful ServiceResult.
 */
export function success<A>(value: A): ServiceResult<A> {
  return Object.freeze({
    isRight: true,
    isSuccess: true,
    right: value,
    value,
  } as const);
}

/**
 * Creates a failed ServiceResult.
 */
export function failure<A = never>(params: ServiceErrorParams | ServiceError): ServiceResult<A> {
  const error = params instanceof ServiceError ? params : new ServiceError(params);
  return Object.freeze({
    isRight: false,
    isSuccess: false,
    left: error,
    error,
  } as const);
}

/**
 * Type guard for failure results.
 */
export function isFailure<A>(
  result: ServiceResult<A>,
): result is Left<ServiceError> & Failure<ServiceError> {
  return !result.isSuccess;
}

/**
 * Type guard for success results.
 */
export function isSuccess<A>(result: ServiceResult<A>): result is Right<A> & Success<A> {
  return result.isSuccess;
}

/**
 * Alias for {@link mapLeft}
 */
export function mapFailure<G>(
  f: (left: ServiceError) => G,
): <A>(result: ServiceResult<A>) => Either<G, A> {
  return mapLeft(f);
}

/**
 * Converts a promise returning function into a ServiceResult by handling potential rejections.
 * If the promise returning function resolves successfully, returns a success ServiceResult.
 * If the promise rejects, calls the onError function to convert the error into a ServiceError.
 *
 * @template A The type of the value the promise resolves to
 * @param f Function returning a Promise to execute. Passing a function allows catching synchronous throws
 * @param onError Maps unknown errors to a ServiceError
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
 *   strictEqual(successResult.value.id, 1);
 *
 *   const failureResult = await tryCatchAsync(
 *     async () => await Promise.reject(new Error("Network error")),
 *     (error) => new ServiceError(`Failed to fetch: ${String(error)}`),
 *   );
 *
 *   ok(isFailure(failureResult));
 *   strictEqual(failureResult.error.issues[0]?.message, "Failed to fetch: Error: Network error");
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
 * strictEqual(successResult.value.name, "John");
 *
 * const failureResult = tryCatch(
 *   () => parseJson("invalid json"),
 *   (error) => new ServiceError(`Parse error: ${String(error)}`),
 * );
 *
 * ok(isFailure(failureResult));
 * ok(failureResult.error.issues[0]?.message?.includes("Parse error"));
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
 * strictEqual(successResult.value.name, "John");
 *
 * const invalidData = { name: "John", age: "thirty" };
 * const failureResult = fromSafeParseReturnType(schema.safeParse(invalidData));
 *
 * ok(isFailure(failureResult));
 * ok(failureResult.error.issues.length > 0);
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
  } catch (mappingError) {
    return failure(ServiceError.merge(error, mappingError));
  }
}
