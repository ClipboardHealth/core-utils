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
 * @example
 * <embedex source="packages/example-nestjs/examples/query.ts">
 *
 * ```ts
 * import { booleanString } from "@clipboard-health/contract-core";
 * import {
 *   cursorPaginationQuery,
 *   fieldsQuery,
 *   type FilterMap,
 *   filterQuery,
 *   includeQuery,
 *   sortQuery,
 * } from "@clipboard-health/json-api-nestjs";
 * import { z } from "zod";
 *
 * import {
 *   type ArticleAttributeFields,
 *   type UserAttributeFields,
 *   type UserIncludeFields,
 * } from "../src/contract";
 *
 * const articleFields = ["title"] as const satisfies readonly ArticleAttributeFields[];
 * const userFields = ["age", "dateOfBirth"] as const satisfies readonly UserAttributeFields[];
 * const userIncludeFields = [
 *   "articles",
 *   "articles.comments",
 * ] as const satisfies readonly UserIncludeFields[];
 * const userFilterMap = {
 *   age: {
 *     filters: ["eq", "gt"],
 *     schema: z.coerce.number().int().positive().max(125),
 *   },
 *   dateOfBirth: {
 *     filters: ["gte"],
 *     schema: z.coerce.date().min(new Date("1900-01-01")).max(new Date()),
 *   },
 *   isActive: {
 *     filters: ["eq"],
 *     schema: booleanString,
 *   },
 * } as const satisfies FilterMap<UserAttributeFields>;
 *
 * /**
 *  * Disclaimer: Just because JSON:API supports robust querying doesn’t mean your service should
 *  * implement them as they may require database indexes, which have a cost. **Implement only access
 *  * patterns required by clients.**
 *  *
 *  * The spec says that if clients provide fields the server doesn’t support, it **MUST** return 400
 *  * Bad Request, hence the `.strict()`.
 *  *\/
 * export const query = z
 *   .object({
 *     ...cursorPaginationQuery(),
 *     ...fieldsQuery({ article: articleFields, user: userFields }),
 *     ...filterQuery(userFilterMap),
 *     ...sortQuery(userFields),
 *     ...includeQuery(userIncludeFields),
 *   })
 *   .strict();
 * ```
 *
 * </embedex>
 *
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
