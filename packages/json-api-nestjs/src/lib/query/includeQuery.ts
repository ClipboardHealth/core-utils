import { type GreaterThan, type Subtract } from "type-fest";
import { z } from "zod";

import { splitString } from "../internal/splitString";
import { type JsonApiDocument, type Relationship } from "../types";

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
        ? Relation extends Record<string, Relationship>
          ? {
              [K in keyof Relation]: K extends string
                ? Relation[K]["data"] extends
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
                : never;
            }[keyof Relation]
          : never
        : never
      : never
    : never;

/**
 * Creates a Zod schema for JSON:API include parameters.
 *
 * @includeExample ./packages/example-nestjs/examples/query.ts
 *
 * @see [Usage example](../../../../example-nestjs/examples/query.ts)
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
