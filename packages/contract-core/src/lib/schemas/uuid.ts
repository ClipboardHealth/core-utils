import { z } from "zod";

/**
 * A UUID string.
 */
export const uuid = z.string().uuid();
