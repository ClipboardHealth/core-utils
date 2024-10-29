export type Left<E> = Readonly<{
  isRight: false;
  left: E;
}>;

export type Right<A> = Readonly<{
  isRight: true;
  right: A;
}>;

/**
 * A value of either type `Left<E>` or type `Right<A>`; a disjoint union.
 *
 * A common use case is as an alternative to {@link Option} where `Left<E>` contains useful
 * information. Convention dictates that `Left<E>` is used for failure and `Right<A>` for success.
 * To help remember, the success case is “right”; it’s the result you want.
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
 * @param either - The either to check
 * @returns `true` if the either is `Left<E>`, `false` if it is `Right<A>`
 */
export function isLeft<E, A>(either: Either<E, A>): either is Left<E> {
  return !either.isRight;
}

/**
 * Type guard that checks if an either is `Right<A>`.
 *
 * @param either - The either to check
 * @returns `true` if the either is `Right<A>`, `false` if it is `Left<E>`
 */
export function isRight<E, A>(either: Either<E, A>): either is Right<A> {
  return either.isRight;
}
