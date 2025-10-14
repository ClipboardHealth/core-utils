import { z } from "zod";

/**
 * A MongoDB ObjectId string.
 */
export const objectId = z.coerce.string().regex(/^[\dA-Fa-f]{24}$/, "Must be a valid ObjectId");
