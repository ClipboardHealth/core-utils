export type None = Readonly<{
  isSome: false;
}>;

export type Some<A> = Readonly<{
  isSome: true;
  value: A;
}>;

/**
 * An optional value. If the value exists, it's of type `Some<A>`, otherwise it's of type `None`.
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
 * Type guard that checks if an option is `None`.
 *
 * @param option - The option to check
 * @returns `true` if the option is `None`, `false` if it is `Some<A>`
 */
export function isNone<A>(option: Option<A>): option is None {
  return !option.isSome;
}

/**
 * Type guard that checks if an option is `Some<A>`.
 *
 * @param option - The option to check
 * @returns `true` if the option is `Some<A>`, `false` if it is `None`
 */
export function isSome<A>(option: Option<A>): option is Some<A> {
  return option.isSome;
}

/**
 * Maps over the value in an Option if it exists.
 */
export function map<A, B>(f: (a: A) => B): (option: Option<A>) => Option<B> {
  return (option) => (isSome(option) ? some(f(option.value)) : none);
}

/**
 * Chains Option operations together.
 */
export function flatMap<A, B>(f: (a: A) => Option<B>): (option: Option<A>) => Option<B> {
  return (option) => (isSome(option) ? f(option.value) : none);
}

/**
 * Gets the value from an Option or returns a default.
 */
export function getOrElse<A>(defaultValue: A): (option: Option<A>) => A {
  return (option) => (isSome(option) ? option.value : defaultValue);
}

/**
 * Pattern matches on an Option, handling both Some and None cases.
 *
 * @param onSome - Function to handle the Some case
 * @param onNone - Function to handle the None case
 */
export function match<A, B>(onSome: (value: A) => B, onNone: () => B): (option: Option<A>) => B {
  return (option) => (isSome(option) ? onSome(option.value) : onNone());
}
