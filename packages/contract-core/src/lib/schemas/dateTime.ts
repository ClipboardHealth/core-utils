import { z } from "zod";

/**
 * Validates datetime inputs and normalizes them to Date objects.
 *
 * Accepts:
 * - ISO-8601 datetime strings (validated strictly)
 * - Date objects (passed through as-is)
 *
 * Rejects epoch numbers, date-only strings, and other loose inputs.
 *
 * Composable with `.optional()`, `.nullable()`, etc. at the call site:
 * ```ts
 * z.object({
 *   start: dateTimeSchema(),
 *   clockIn: dateTimeSchema().optional(),
 * });
 * ```
 *
 * z.input  → string | Date
 * z.output → Date
 */
export function dateTimeSchema() {
  return z
    .union([z.string().datetime(), z.date()])
    .transform((value) => (value instanceof Date ? value : new Date(value)));
}
