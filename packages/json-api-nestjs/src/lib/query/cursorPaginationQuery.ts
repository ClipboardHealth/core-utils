import { nonEmptyString } from "@clipboard-health/contract-core";
import { z } from "zod";

export const PAGINATION = {
  size: {
    maximum: 200,
    default: 20,
  },
} as const;

/**
 * Creates a Zod schema for JSON:API cursor pagination.
 *
 * @includeExample ./packages/example-nestjs/examples/query.ts
 *
 * @see [Usage example](../../../../example-nestjs/examples/query.ts)
 * @see {@link https://jsonapi.org/format/#fetching-pagination JSON:API pagination}
 * @see {@link https://jsonapi.org/examples/#pagination JSON:API pagination examples}
 */
export function cursorPaginationQuery(
  parameters?: Readonly<{ size: { maximum?: number; default?: number } }>,
) {
  const { size } = PAGINATION;
  const { maximum = size.maximum, default: defaultSize = size.default } = parameters?.size ?? {};

  return {
    page: z
      .object({
        size: z.coerce.number().int().positive().max(maximum).default(defaultSize),
        cursor: nonEmptyString.optional(),
      })
      .strict()
      .default({ size: defaultSize }),
  };
}
