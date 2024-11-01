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
 * @includeExample ./packages/util-ts/examples/option.ts
 * @see [Usage example](../../util-ts/examples/option.ts)
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
