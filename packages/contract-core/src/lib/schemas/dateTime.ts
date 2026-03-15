import { z } from "zod";

/**
 * Validates that the input is a strict ISO-8601 datetime string,
 * then transforms it into a Date object.
 *
 * Composable with `.optional()`, `.nullable()`, etc. at the call site:
 * ```ts
 * z.object({
 *   start: dateTimeSchema(),
 *   clockIn: dateTimeSchema().optional(),
 * });
 * ```
 *
 * z.input  → string (what callers send over the wire)
 * z.output → Date   (what callers receive after parsing)
 *
 * Requires `parsedApi.ts` so that schemas are parsed at runtime.
 */
export function dateTimeSchema() {
  return z
    .string()
    .datetime()
    .transform((value) => new Date(value));
}
