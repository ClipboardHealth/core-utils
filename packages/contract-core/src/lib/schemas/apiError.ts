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

export const apiErrorSource = z.object({
  pointer: z.string().optional(),
  parameter: z.string().optional(),
  header: z.string().optional(),
});

export function apiErrorsWith<ErrorSchema extends z.ZodType<ApiError>>(error: ErrorSchema) {
  return apiErrors.extend({
    errors: error.array().min(0).max(100),
  });
}

/**
 * @see {@link https://jsonapi.org/format/#error-objects Error Objects}
 */
export type ApiError = z.infer<typeof apiError>;
