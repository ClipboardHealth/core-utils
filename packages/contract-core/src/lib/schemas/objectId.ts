import { z } from "zod";

/**
 * A MongoDB ObjectId string.
 */
export const objectId = z.string().refine((value) => /^[\dA-Fa-f]{24}$/.test(value), {
  message: "Must be a valid ObjectId",
});
