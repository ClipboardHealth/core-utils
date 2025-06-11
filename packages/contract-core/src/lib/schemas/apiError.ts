import { z } from "zod";

import { nonEmptyString } from "./nonEmptyString";

/**
 * @see {@link https://jsonapi.org/format/#error-objects Error Objects}
 */
export const apiError = z.object({
  code: nonEmptyString,
  detail: z.string().optional(),
  id: nonEmptyString,
  status: nonEmptyString,
  title: z.string().optional(),
});

/**
 * @see {@link https://jsonapi.org/format/#errors Errors}
 */
export const apiErrors = z.object({
  errors: apiError.array().min(0).max(100),
});

/**
 * @see {@link https://jsonapi.org/format/#error-objects Error Objects}
 */
export type ApiError = z.infer<typeof apiError>;
