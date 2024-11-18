import { z } from "zod";

import { splitString } from "../internal/splitString";
import { type Field } from "../types";

/**
 * Creates a Zod schema for JSON:API sort parameters.
 *
 * @example
 * ```ts
 * // packages/example-nestjs/examples/query.ts
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
 * export const query = z
 *   .object({
 *     ...cursorPaginationQuery(),
 *     ...fieldsQuery({ article: articleFields, user: userFields }),
 *     ...filterQuery(userFilterMap),
 *     ...sortQuery(userFields),
 *     ...includeQuery(userIncludeFields),
 *   })
 *   .strict();
 *
 * ```
 *
 * @see {@link https://jsonapi.org/format/#fetching-sorting JSON:API sorting}
 */
export function sortQuery<const FieldT extends readonly [Field, ...Field[]]>(fields: FieldT) {
  const fieldSet = new Set(fields);
  return {
    sort: z
      .preprocess(splitString, z.string().array().min(1).max(100).optional())
      .superRefine((value, context) => {
        if (!value) {
          return;
        }

        for (const field of value) {
          if (!fieldSet.has(field.startsWith("-") ? field.slice(1) : field)) {
            context.addIssue({
              code: z.ZodIssueCode.custom,
              message: `Invalid sort field: '${field}'`,
              path: ["sort", field],
            });
          }
        }
      })
      .transform((value) => value as Array<`-${FieldT[number]}` | FieldT[number]> | undefined),
  };
}
