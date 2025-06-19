import { isValidObjectId } from "mongoose";
import { z } from "zod";

/**
 * A MongoDB ObjectId string.
 */
export const objectId = z
  .string()
  .refine((value) => isValidObjectId(value), "Must be a valid ObjectId");
