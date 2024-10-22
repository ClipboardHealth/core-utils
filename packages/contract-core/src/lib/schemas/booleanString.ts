import { z } from "zod";

/**
 * A Zod schema for use with boolean query parameters since `z.coerce.boolean()` treats any truthy
 * value as `true`.
 *
 * `.transform((value) => value === "true")` causes inference issues in controllers.
 */
export const booleanString = z.enum(["true", "false"]);

export type BooleanString = z.infer<typeof booleanString>;

export function toBoolean(value: BooleanString): boolean {
  return value === "true";
}
