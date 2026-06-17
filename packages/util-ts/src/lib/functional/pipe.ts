export function pipe<A>(a: A): A;
export function pipe<A, B>(a: A, ab: (a: A) => B): B;
export function pipe<A, B, C>(a: A, ab: (a: A) => B, bc: (b: B) => C): C;
export function pipe<A, B, C, D>(a: A, ab: (a: A) => B, bc: (b: B) => C, cd: (c: C) => D): D;
export function pipe<A, B, C, D, E>(
  a: A,
  ab: (a: A) => B,
  bc: (b: B) => C,
  cd: (c: C) => D,
  de: (d: D) => E,
): E;
export function pipe<A, B, C, D, E, F>(
  a: A,
  ab: (a: A) => B,
  bc: (b: B) => C,
  cd: (c: C) => D,
  de: (d: D) => E,
  ef: (ef: E) => F,
): F;
export function pipe<A, B, C, D, E, F, G>(
  a: A,
  ab: (a: A) => B,
  bc: (b: B) => C,
  cd: (c: C) => D,
  de: (d: D) => E,
  ef: (ef: E) => F,
  fg: (f: F) => G,
): G;
export function pipe<A, B, C, D, E, F, G, H>(
  a: A,
  ab: (a: A) => B,
  bc: (b: B) => C,
  cd: (c: C) => D,
  de: (d: D) => E,
  ef: (ef: E) => F,
  fg: (f: F) => G,
  gh: (g: G) => H,
): H;
export function pipe<A, B, C, D, E, F, G, H, I>(
  a: A,
  ab: (a: A) => B,
  bc: (b: B) => C,
  cd: (c: C) => D,
  de: (d: D) => E,
  ef: (ef: E) => F,
  fg: (f: F) => G,
  gh: (g: G) => H,
  hi: (h: H) => I,
): I;
export function pipe<A, B, C, D, E, F, G, H, I, J>(
  a: A,
  ab: (a: A) => B,
  bc: (b: B) => C,
  cd: (c: C) => D,
  de: (d: D) => E,
  ef: (ef: E) => F,
  fg: (f: F) => G,
  gh: (g: G) => H,
  hi: (h: H) => I,
  ij: (ij: I) => J,
): J;
/**
 * Pipes a value through a series of functions from left to right. Currently supports up to 10
 * functions.
 *
 * @param a - The initial value to transform
 * @param fs - Functions to apply sequentially
 * @returns The final transformed value
 * @example
 * <embedex source="packages/util-ts/examples/pipe.ts">
 *
 * ```ts
 * import { strictEqual } from "node:assert/strict";
 *
 * import { pipe } from "@clipboard-health/util-ts";
 *
 * const result = pipe(
 *   "  hello world  ",
 *   (s) => s.trim(),
 *   (s) => s.split(" "),
 *   (array) => array.map((word) => word.charAt(0).toUpperCase() + word.slice(1)),
 *   (array) => array.join(" "),
 * );
 *
 * strictEqual(result, "Hello World");
 * ```
 *
 * </embedex>
 */
export function pipe(a: unknown, ...fs: Array<(a: unknown) => unknown>): unknown {
  return fs.reduce((accumulator, f) => f(accumulator), a);
}
