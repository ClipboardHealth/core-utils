import { z } from "zod";

/**
 * Regular expressions from
 * {@link https://github.com/nestjs/nest/blob/master/packages/common/pipes/parse-uuid.pipe.ts}.
 */
export const uuid = z
  .string()
  .trim()
  // eslint-disable-next-line unicorn/better-regex
  .regex(/^[0-9A-F]{8}-[0-9A-F]{4}-[0-9A-F]{4}-[0-9A-F]{4}-[0-9A-F]{12}$/i, {
    message: "Invalid UUID format",
  });
