export interface None {
  isSome: false;
}

export interface Some<A> {
  isSome: true;
  value: A;
}

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
 */
export function some<A>(value: A): Some<A> {
  return { isSome: true, value };
}

/**
 * Returns `true` if the option is `None`, `false` otherwise.
 */
export function isNone<A>(option: Option<A>): option is None {
  return !option.isSome;
}

/**
 * Returns `true` if the option is `Some<A>`, `false` otherwise.
 */
export function isSome<A>(option: Option<A>): option is Some<A> {
  return option.isSome;
}
