import { isNil } from "../nullish";

export type None = Readonly<{
  isSome: false;
}>;

export type Some<A> = Readonly<{
  isSome: true;
  value: A;
}>;

/**
 * An optional value. If the value exists, it's of type `Some<A>`, otherwise it's of type `None`.
 *
 * @example
 * <embedex source="packages/util-ts/examples/option.ts">
 *
 * ```ts
 * import { strictEqual } from "node:assert/strict";
 *
 * import { option as O, pipe } from "@clipboard-health/util-ts";
 *
 * function double(n: number) {
 *   return n * 2;
 * }
 *
 * function inverse(n: number): O.Option<number> {
 *   return n === 0 ? O.none : O.some(1 / n);
 * }
 *
 * const result = pipe(
 *   O.some(5),
 *   O.map(double),
 *   O.flatMap(inverse),
 *   O.match(
 *     () => "No result",
 *     (n) => `Result is ${n}`,
 *   ),
 * );
 *
 * strictEqual(result, "Result is 0.1");
 * ```
 *
 * </embedex>
 */
export type Option<A> = None | Some<A>;

/**
 * Constructs an `Option` of `None`, representing a missing value.
 */
export const none: None = { isSome: false };

/**
 * Constructs an `Option` holding a `Some<A>`, representing an optional value that exists.
 *
 * @param value - The value to wrap in a `Some`
 * @returns A `Some` containing the value
 */
export function some<A>(value: A): Some<A> {
  return { isSome: true, value };
}

/**
 * Type guard that checks if an `Option` is `None`.
 *
 * @param option - The `Option` to check
 * @returns `true` if the `Option` is `None`, `false` if it is `Some<A>`
 */
export function isNone<A>(option: Option<A>): option is None {
  return !option.isSome;
}

/**
 * Type guard that checks if an `Option` is `Some<A>`.
 *
 * @param option - The `Option` to check
 * @returns `true` if the `Option` is `Some<A>`, `false` if it is `None`
 */
export function isSome<A>(option: Option<A>): option is Some<A> {
  return option.isSome;
}

/**
 * Transforms the value inside an `Option` using the provided function. If the `Option` is
 * `Some(value)`, returns `Some(f(value))`. If the `Option` is `None`, returns `None`.
 *
 * @param f - The function to apply to the value if it exists
 * @returns A new `Option` containing the transformed value
 */
export function map<A, B>(f: (a: A) => B): (option: Option<A>) => Option<B> {
  return (option) => (isSome(option) ? some(f(option.value)) : none);
}

/**
 * Chains `Option` operations that return `Option`s. Unlike `map` which wraps the result in a new
 * `Option`, `flatMap` prevents nested `Option`s like `Some(Some(value))`.
 *
 * @param f - A function that returns an `Option`
 * @returns The `Option` returned by the function if the input is `Some`, `None` otherwise
 */
export function flatMap<A, B>(f: (a: A) => Option<B>): (option: Option<A>) => Option<B> {
  return (option) => (isSome(option) ? f(option.value) : none);
}

/**
 * Safely extracts the value from an `Option` with a fallback. Use this function when you need to
 * convert an `Option<A>` to an `A`, providing a default value for the `None` case.
 *
 * @param defaultValue - The value to return if the `Option` is `None`
 * @returns The contained value if `Some`, `defaultValue` if `None`
 */
export function getOrElse<A>(defaultValue: A): (option: Option<A>) => A {
  return (option) => (isSome(option) ? option.value : defaultValue);
}

/**
 * Pattern matches on an `Option`, handling both `Some` and `None` cases.
 *
 * @param onNone - Function to handle the `None` case
 * @param onSome - Function to handle the `Some` case
 * @returns The result of either `onNone` or `onSome` based on the `Option` state
 */
export function match<A, B, C>(
  onNone: () => B,
  onSome: (value: A) => C,
): (option: Option<A>) => B | C {
  return (option) => (isSome(option) ? onSome(option.value) : onNone());
}

/**
 * Converts a nullable value to an `Option`. If the value is `null` or `undefined`, returns `None`.
 * Otherwise, returns `Some(value)`.
 *
 * @param value - The value to convert
 * @returns An `Option` representing the nullable value
 */
// eslint-disable-next-line
export function fromNullable<A>(value: A | null | undefined): Option<A> {
  return isNil(value) ? none : some(value);
}
