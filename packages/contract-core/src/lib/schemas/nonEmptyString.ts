import { z } from "zod";

/**
 * A non-empty string Zod schema.
 */
export const nonEmptyString = z.string().min(1);
