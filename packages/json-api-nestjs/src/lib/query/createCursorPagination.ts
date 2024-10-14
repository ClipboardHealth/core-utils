import { z } from "zod";

import { nonEmptyString } from "../schemas";

/**
 * Creates a Zod schema for JSON:API cursor pagination.
 *
 * @includeExample ./packages/json-api-nestjs/examples/query.ts
 *
 * @see [Usage example](../../../examples/query.ts)
 * @see {@link https://jsonapi.org/format/#fetching-pagination JSON:API pagination}
 * @see {@link https://jsonapi.org/examples/#pagination JSON:API pagination examples}
 */
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
