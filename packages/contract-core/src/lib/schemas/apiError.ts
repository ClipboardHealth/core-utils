import { z } from "zod";

import { nonEmptyString } from "./nonEmptyString";

const apiError = z.object({
  code: nonEmptyString,
  detail: z.string().optional(),
  id: nonEmptyString,
  status: nonEmptyString,
  title: nonEmptyString,
});

export const apiErrors = z.object({
  errors: apiError.array(),
});

export type ApiError = z.infer<typeof apiError>;
