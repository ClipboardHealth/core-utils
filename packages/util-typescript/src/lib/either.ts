export interface Left<E> {
  isRight: false;
  left: E;
}

export interface Right<A> {
  isRight: true;
  right: A;
}

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
 */
export function left<E, A = never>(left: E): Either<E, A> {
  return { isRight: false, left };
}

/**
 * Constructs an `Either` holding a `Right<A>` value, usually representing a success.
 */
export function right<A, E = never>(right: A): Either<E, A> {
  return { isRight: true, right };
}

/**
 * Returns `true` if the either is `Left<E>`, `false` otherwise.
 */
export function isLeft<E, A>(either: Either<E, A>): either is Left<E> {
  return !either.isRight;
}

/**
 * Returns `true` if the either is `Right<A>`, `false` otherwise.
 */
export function isRight<E, A>(either: Either<E, A>): either is Right<A> {
  return either.isRight;
}
