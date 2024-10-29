import { nonEmptyString } from "@clipboard-health/contract-core";
import { z } from "zod";

export const PAGINATION = {
  size: {
    default: 20,
    maximum: 200,
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
  parameters?: Readonly<{ size: { default?: number; maximum?: number } }>,
) {
  const { size } = PAGINATION;
  const { default: defaultSize = size.default, maximum = size.maximum } = parameters?.size ?? {};

  return {
    page: z
      .object({
        cursor: nonEmptyString.optional(),
        size: z.coerce.number().int().positive().max(maximum).default(defaultSize),
      })
      .strict()
      .default({ size: defaultSize }),
  };
}
