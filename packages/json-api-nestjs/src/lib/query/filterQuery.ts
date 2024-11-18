import { z } from "zod";

import { queryFilterPreprocessor } from "../internal/queryFilterPreprocessor";
import { splitString } from "../internal/splitString";
import { type Field } from "../types";

export type Filter = "eq" | "ne" | "gt" | "gte" | "lt" | "lte";

export type FilterTuple = readonly [Filter, ...Filter[]];

export interface FilterValue {
  filters: FilterTuple;
  schema: z.ZodTypeAny;
}

type InternalFilterMap<FieldT extends Field = Field> = Record<FieldT, FilterValue>;

export type FilterMap<FieldT extends Field = Field> = Partial<InternalFilterMap<FieldT>>;

export type FilterSchema<MapT extends InternalFilterMap> = {
  [K in keyof MapT]: z.ZodOptional<
    z.ZodEffects<
      z.ZodOptional<
        z.ZodObject<{
          [F in MapT[K]["filters"][number]]: z.ZodOptional<
            z.ZodEffects<z.ZodOptional<z.ZodArray<MapT[K]["schema"]>>>
          >;
        }>
      >
    >
  >;
};

/**
 * Creates a Zod schema for JSON:API filters.
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
 * @see {@link https://jsonapi.org/recommendations/#filtering JSON:API filtering}
 * @see {@link https://discuss.jsonapi.org/t/share-propose-a-filtering-strategy/257 JSON:API filtering strategy}
 */
export function filterQuery<const MapT extends InternalFilterMap>(parameters: Readonly<MapT>) {
  return {
    filter: z
      .object(
        Object.fromEntries(
          Object.entries(parameters).map(([apiType, value]: [keyof MapT, MapT[keyof MapT]]) => [
            apiType,
            z.preprocess(queryFilterPreprocessor, filterSchema(value)).optional(),
          ]),
        ) as FilterSchema<MapT>,
      )
      .strict()
      .optional(),
  };
}

function filterSchema(parameters: FilterValue) {
  const { filters, schema } = parameters;

  return z
    .object(
      Object.fromEntries(
        filters.map((filter) => [
          filter,
          z.preprocess(splitString, schema.array().min(1).max(10_000).optional()).optional(),
        ]),
      ),
    )
    .strict()
    .optional();
}
