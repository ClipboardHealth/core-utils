import { z } from "zod";

import { splitString } from "../internal/splitString";
import { type Field } from "../types";

/**
 * Creates a Zod schema for JSON:API sort parameters.
 *
 * @includeExample ./packages/example-nestjs/examples/query.ts
 *
 * @see [Usage example](../../../../example-nestjs/examples/query.ts)
 * @see {@link https://jsonapi.org/format/#fetching-sorting JSON:API sorting}
 */
export function sortQuery<const FieldT extends readonly [Field, ...Field[]]>(fields: FieldT) {
  const fieldSet = new Set(fields);
  return {
    sort: z
      .preprocess(splitString, z.string().array().min(1).max(100).optional())
      .superRefine((value, context) => {
        if (!value) {
          return;
        }

        for (const field of value) {
          if (!fieldSet.has(field.startsWith("-") ? field.slice(1) : field)) {
            context.addIssue({
              code: z.ZodIssueCode.custom,
              message: `Invalid sort field: '${field}'`,
              path: ["sort", field],
            });
          }
        }
      })
      .transform((value) => value as Array<`-${FieldT[number]}` | FieldT[number]> | undefined),
  };
}
