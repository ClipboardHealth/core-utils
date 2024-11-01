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
 * @includeExample ./packages/example-nestjs/examples/query.ts
 *
 * @see [Usage example](../../../../example-nestjs/examples/query.ts)
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
