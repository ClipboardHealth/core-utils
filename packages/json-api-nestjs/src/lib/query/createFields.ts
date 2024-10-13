import { z } from "zod";

import { splitString } from "../internal/splitString";
import { type ApiType } from "../types";

type Field = string;

export type FieldsMap = Record<ApiType, readonly [Field, ...Field[]]>;

export type FieldsSchema<MapT extends FieldsMap> = {
  [K in keyof MapT]: z.ZodEffects<
    z.ZodOptional<z.ZodArray<z.ZodEnum<z.Writeable<MapT[K]>>>>,
    Array<MapT[K][number]> | undefined,
    unknown
  >;
};

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
