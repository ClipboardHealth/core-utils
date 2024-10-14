import { z } from "zod";

/**
 * A non-empty string Zod schema.
 */
export const nonEmptyString = z.string().min(1);

/**
 * A Zod schema for use with boolean query parameters since `z.coerce.boolean()` treats any truthy
 * value as `true`.
 */
export const booleanString = z.enum(["true", "false"]).transform((value) => value === "true");
