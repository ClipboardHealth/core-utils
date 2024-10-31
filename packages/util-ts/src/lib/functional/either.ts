export type Left<E> = Readonly<{
  isRight: false;
  left: E;
}>;

export type Right<A> = Readonly<{
  isRight: true;
  right: A;
}>;

/**
 * A value of `Either` type `Left<E>` or type `Right<A>`; a disjoint union.
 *
 * A common use case is as an alternative to {@link Option} where `Left<E>` contains useful
 * information. Convention dictates that `Left<E>` is used for failure and `Right<A>` for success.
 * To help remember, the success case is "right"; it's the result you want.
 *
 * @includeExample ./packages/util-ts/examples/either.ts
 * @see [Usage example](../../util-ts/examples/either.ts)
 */
export type Either<E, A> = Left<E> | Right<A>;

/**
 * Constructs an `Either` holding a `Left<E>` value, usually representing a failure.
 *
 * @param left - The value to wrap in a `Left`
 * @returns A `Left` containing the value
 */
export function left<E, A = never>(left: E): Either<E, A> {
  return { isRight: false, left };
}

/**
 * Constructs an `Either` holding a `Right<A>`, representing a success.
 *
 * @param value - The value to wrap in a `Right`
 * @returns A `Right` containing the value
 */
export function right<A, E = never>(right: A): Either<E, A> {
  return { isRight: true, right };
}

/**
 * Type guard that checks if an either is `Left<E>`.
 *
 * @param either - The `Either` to check
 * @returns `true` if the `Either` is `Left<E>`, `false` if it is `Right<A>`
 */
export function isLeft<E, A>(either: Either<E, A>): either is Left<E> {
  return !either.isRight;
}

/**
 * Type guard that checks if an either is `Right<A>`.
 *
 * @param either - The `Either` to check
 * @returns `true` if the `Either` is `Right<A>`, `false` if it is `Left<E>`
 */
export function isRight<E, A>(either: Either<E, A>): either is Right<A> {
  return either.isRight;
}

/**
 * Transforms the value inside an `Either` using the provided function. If the `Either` is
 * `Right(value)`, returns `Right(f(value))`. If the `Either` is `Left(value)`, returns
 * `Left(value)`.
 *
 * @param f - The function to apply to the `Right` value
 * @returns A function that transforms `Either<E, A>` to `Either<E, B>`
 */
export function map<A, B>(f: (right: A) => B): <E>(either: Either<E, A>) => Either<E, B> {
  return (either) => (isRight(either) ? right(f(either.right)) : either);
}

/**
 * Transforms the value inside an `Either` using the provided function. If the `Either` is
 * `Left(value)`, returns `Left(f(value))`. If the `Either` is `Right(value)`, returns
 * `Right(value)`.
 */
export function mapLeft<E, G>(f: (left: E) => G): <A>(either: Either<E, A>) => Either<G, A> {
  return (either) => (isLeft(either) ? left(f(either.left)) : either);
}

/**
 * Chains `Either` operations that return `Either`s. Unlike `map` which wraps the result in a new
 * `Either`, `flatMap` prevents nested `Either`s like `Right(Right(value))`.
 *
 * @param f - A function that returns an `Either`
 * @returns The `Either` returned by the function if the input is `Right`, `Left` otherwise
 */
export function flatMap<E, A, B>(
  f: (right: A) => Either<E, B>,
): (either: Either<E, A>) => Either<E, B> {
  return (either) => (isRight(either) ? f(either.right) : either);
}

/**
 * Safely extracts the value from an `Either` with a fallback. Use this function when you need to
 * convert an `Either<E, A>` to an `A`, providing a default value for the `Left` case.
 *
 * @param defaultValue - The value to return if the `Either` is `Left`
 * @returns The contained value if `Right`, `defaultValue` if `Left`
 */
export function getOrElse<E, A>(onLeft: (left: E) => A): (either: Either<E, A>) => A {
  return (either) => (isRight(either) ? either.right : onLeft(either.left));
}

/**
 * Pattern matches on an `Either`, handling both `Right` and `Left` cases.
 *
 * @param onLeft - Function to handle the `Left` case
 * @param onRight - Function to handle the `Right` case
 * @returns The result of `Either` `onLeft` or `onRight` based on the `Either` state
 */
export function match<E, A, B>(
  onLeft: (left: E) => B,
  onRight: (right: A) => B,
): (either: Either<E, A>) => B {
  return (either) => (isRight(either) ? onRight(either.right) : onLeft(either.left));
}
