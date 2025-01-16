import { type GreaterThan, type Subtract } from "type-fest";
import { z } from "zod";

import { splitString } from "../internal/splitString";
import { type JsonApiDocument, type Relationship, type Relationships } from "../types";

/**
 * Recursively traverse the JSON:API document to build a list of all possible relationship paths up
 * to the specified depth, which prevents stack overflow for circular relationships. Use the result
 * in `include` queries
 *
 * @template MapT - A map of ApiType to Zod schemas.
 * @template DocumentT - The JSON:API document.
 * @template Depth - The maximum depth for recursive relationship traversal.
 * @template Prefix - The prefix for nested relationship paths.
 */
export type RelationshipPaths<
  MapT extends Record<string, z.ZodTypeAny>,
  DocumentT extends JsonApiDocument,
  Depth extends number = 5,
  Prefix extends string = "",
> =
  GreaterThan<Depth, 0> extends true
    ? DocumentT["data"] extends Array<infer Data> | infer Data
      ? Data extends { relationships?: infer Relation }
        ? Relation extends Relationships
          ? {
              [K in keyof Relation]: K extends string
                ? NonNullable<Relation[K]> extends Relationship
                  ? NonNullable<Relation[K]>["data"] extends
                      | { type?: infer RelationT }
                      | Array<{ type?: infer RelationT }>
                    ? RelationT extends keyof MapT
                      ?
                          | `${Prefix}${K}`
                          | RelationshipPaths<
                              MapT,
                              z.infer<MapT[RelationT]>,
                              Subtract<Depth, 1>,
                              `${Prefix}${K}.`
                            >
                      : never
                    : never
                  : never
                : never;
            }[keyof Relation]
          : never
        : never
      : never
    : never;

/**
 * Creates a Zod schema for JSON:API include parameters.
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
 * @see {@link https://jsonapi.org/format/#fetching-includes JSON:API includes}
 */
export function includeQuery<const FieldT extends readonly string[]>(fields: FieldT) {
  const fieldSet = new Set(fields);

  return {
    include: z
      .preprocess(splitString, z.string().array().min(1).max(100).optional())
      .superRefine((value, context) => {
        if (!value) {
          return;
        }

        for (const field of value) {
          if (!fieldSet.has(field)) {
            context.addIssue({
              code: z.ZodIssueCode.custom,
              message: `Invalid include field: '${field}'`,
              path: ["include", field],
            });
          }
        }
      })
      .transform((value) => value as Array<FieldT[number]> | undefined),
  };
}
