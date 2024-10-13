import { z } from "zod";

import { nonEmptyString } from "../schemas";

export function createCursorPagination(
  parameters?: Readonly<{ maximumSize?: number; defaultSize?: number }>,
) {
  const { maximumSize = 200, defaultSize = 20 } = parameters ?? {};

  return {
    page: z
      .object({
        size: z.coerce.number().int().positive().max(maximumSize).default(defaultSize),
        cursor: nonEmptyString.optional(),
      })
      .strict()
      .default({ size: defaultSize }),
  };
}
