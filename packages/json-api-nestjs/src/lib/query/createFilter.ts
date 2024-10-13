import { z } from "zod";

import { queryFilterPreprocessor } from "../internal/queryFilterPreprocessor";
import { splitString } from "../internal/splitString";
import { type ApiType } from "../types";

export type Filter = "eq" | "ne" | "gt" | "gte" | "lt" | "lte" | "not";

export type FilterMap = Record<
  ApiType,
  {
    filters: readonly [Filter, ...Filter[]];
    schema: z.ZodTypeAny;
  }
>;

export type FilterObject<MapT extends FilterMap> = {
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

export function createFilter<const MapT extends FilterMap>(parameters: Readonly<MapT>) {
  return {
    filter: z
      .object(
        Object.fromEntries(
          Object.entries(parameters).map(
            ([apiType, { filters, schema }]: [keyof MapT, MapT[keyof MapT]]) => [
              apiType,
              z
                .preprocess(
                  queryFilterPreprocessor,
                  z
                    .object(
                      Object.fromEntries(
                        filters.map((filter: Filter) => [
                          filter,
                          z.preprocess(splitString, z.array(schema).optional()).optional(),
                        ]),
                      ),
                    )
                    .strict()
                    .optional(),
                )
                .optional(),
            ],
          ),
          // Type assertion to narrow types.
        ) as FilterObject<MapT>,
      )
      .strict()
      .optional(),
  };
}
