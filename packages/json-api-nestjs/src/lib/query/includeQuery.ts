import { type GreaterThan, type Subtract } from "type-fest";
import { z } from "zod";

import { splitString } from "../internal/splitString";
import { type JsonApiDocument, type Relationship } from "../types";

/**
 * JSON:API relationship paths for use in include queries.
 *
 * @template MapT - A map of ApiType to Zod schemas.
 * @template DocumentT - The JSON:API document.
 * @template RecursiveDepth - The maximum depth for recursive relationship traversal.
 * @template Prefix - The prefix for nested relationship paths.
 */
export type RelationshipPaths<
  MapT extends Record<string, z.ZodTypeAny>,
  DocumentT extends JsonApiDocument,
  RecursiveDepth extends number = 5,
  Prefix extends string = "",
> = RecursiveDepth extends infer Depth extends number
  ? GreaterThan<Depth, 0> extends true
    ? DocumentT["data"] extends { relationships?: infer R }
      ? R extends Record<string, Relationship>
        ? {
            [K in keyof R]: K extends string
              ? R[K]["data"] extends { type?: infer RelationT }
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
              : never;
          }[keyof R]
        : never
      : never
    : never
  : never;

/**
 * Creates a Zod schema for JSON:API include parameters.
 *
 * @includeExample ./packages/json-api-nestjs/examples/query.ts
 *
 * @see [Usage example](../../../examples/query.ts)
 * @see {@link https://jsonapi.org/format/#fetching-includes JSON:API includes}
 */
export function includeQuery<const FieldT extends readonly string[]>(fields: FieldT) {
  const fieldSet = new Set(fields);

  return {
    include: z
      .preprocess(splitString, z.array(z.string()).optional())
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
