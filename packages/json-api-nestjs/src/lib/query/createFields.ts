import { z } from "zod";

import { splitString } from "../internal/splitString";
import { type ApiType, type Field } from "../types";

export type FieldsMap = Record<ApiType, readonly [Field, ...Field[]]>;

export type FieldsSchema<MapT extends FieldsMap> = {
  [K in keyof MapT]: z.ZodEffects<
    z.ZodOptional<z.ZodArray<z.ZodEnum<z.Writeable<MapT[K]>>>>,
    Array<MapT[K][number]> | undefined,
    unknown
  >;
};

/**
 * Creates a Zod schema for JSON:API sparse fieldsets.
 *
 * @includeExample ./packages/json-api-nestjs/examples/query.ts
 *
 * @see [Usage example](../../../examples/query.ts)
 * @see {@link https://jsonapi.org/format/#fetching-sparse-fieldsets JSON:API sparse fieldsets}
 */
export function createFields<const MapT extends FieldsMap>(parameters: Readonly<MapT>) {
  const fieldSchemas = Object.fromEntries(
    Object.entries(parameters).map(([apiType, fields]: [keyof MapT, MapT[keyof MapT]]) => [
      apiType,
      z.preprocess(splitString, z.array(z.enum(fields)).min(1).optional()),
    ]),
    // Type assertion to narrow types.
  ) as FieldsSchema<MapT>;

  return {
    fields: z.object(fieldSchemas).strict().optional(),
  };
}
