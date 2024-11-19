import { z } from "zod";

import { splitString } from "../internal/splitString";
import { type ApiType, type Data, type Field, type JsonApiDocument } from "../types";

export type FieldsMap = Record<ApiType, readonly [Field, ...Field[]]>;

export type FieldsSchema<MapT extends FieldsMap> = {
  [K in keyof MapT]: z.ZodEffects<
    z.ZodOptional<z.ZodArray<z.ZodEnum<z.Writeable<MapT[K]>>>>,
    Array<MapT[K][number]> | undefined,
    unknown
  >;
};

/**
 * JSON:API attribute fields for use in fields queries.
 *
 * @template DocumentT - The JSON:API document.
 */
export type AttributeFields<DocumentT extends JsonApiDocument> =
  DocumentT["data"] extends Array<infer R extends Data>
    ? keyof R["attributes"]
    : DocumentT["data"] extends Data
      ? keyof DocumentT["data"]["attributes"]
      : never;

/**
 * Creates a Zod schema for JSON:API sparse fieldsets.
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
 *
 * ```
 *
 * @see {@link https://jsonapi.org/format/#fetching-sparse-fieldsets JSON:API sparse fieldsets}
 */
export function fieldsQuery<const MapT extends FieldsMap>(parameters: Readonly<MapT>) {
  const fieldSchemas = Object.fromEntries(
    Object.entries(parameters).map(([apiType, fields]: [keyof MapT, MapT[keyof MapT]]) => [
      apiType,
      z.preprocess(splitString, z.enum(fields).array().min(1).max(100).optional()),
    ]),
    // Type assertion to narrow types.
  ) as FieldsSchema<MapT>;

  return {
    fields: z.object(fieldSchemas).strict().optional(),
  };
}
