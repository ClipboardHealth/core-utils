import { z } from "zod";

/**
 * A non-empty array Zod schema.
 *
 * Output type resolves to `[z.output<T>, ...Array<z.output<T>>]`, giving consumers a
 * type-level guarantee that the array contains at least one element.
 *
 * Unlike `nonEmptyString`, which is runtime-only (TypeScript has no structural
 * "non-empty string" type without branding), this helper provides a real
 * type-level non-empty guarantee that pairs naturally with `isNonEmptyArray`
 * from `@clipboard-health/util-ts`.
 *
 * @example
 * const tagsSchema = nonEmptyArray(z.string());
 * type Tags = z.output<typeof tagsSchema>; // [string, ...string[]]
 */
export function nonEmptyArray<T extends z.ZodTypeAny>(schema: T) {
  return z.array(schema).nonempty();
}
