import { z } from "zod";

/**
 * Validates comma-separated string or array inputs and normalizes them to typed arrays.
 *
 * Accepts:
 * - Comma-separated strings (split and validated per item)
 * - Arrays of items (validated per item)
 *
 * Designed for shared contracts where the server receives comma-separated query strings
 * and the client passes typed arrays.
 *
 * Composable with `.optional()`, `.nullable()`, etc. at the call site:
 * ```ts
 * z.object({
 *   workerTypes: commaSeparatedArray(z.string().min(1)).optional(),
 *   dates: commaSeparatedArray(dateTimeSchema()).optional(),
 * });
 * ```
 *
 * z.input  → string | T[]  (where T is z.input of the item schema)
 * z.output → T[]           (where T is z.output of the item schema)
 */
export function commaSeparatedArray<T extends z.ZodTypeAny>(itemSchema: T) {
  return z
    .union([z.string().transform((value) => value.split(",")), z.array(itemSchema)])
    .pipe(z.array(itemSchema));
}
