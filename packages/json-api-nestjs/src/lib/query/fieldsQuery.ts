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
 * @includeExample ./packages/json-api-nestjs/examples/query.ts
 *
 * @see [Usage example](../../../examples/query.ts)
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
