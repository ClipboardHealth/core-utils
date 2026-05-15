import { z } from "zod";

/**
 * A non-empty string Zod schema.
 *
 * Runtime-only: the output type remains `string`. TypeScript has no structural
 * "non-empty string" type without branding, so non-emptiness cannot be carried
 * through the type system. Contrast with `nonEmptyArray`, which produces a
 * tuple type `[T, ...T[]]` that does encode non-emptiness.
 */
export const nonEmptyString = z.string().min(1);
