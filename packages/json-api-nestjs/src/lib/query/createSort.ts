import { z } from "zod";

import { splitString } from "../internal/splitString";
import { type Field } from "../types";

/**
 * Creates a Zod schema for JSON:API sort parameters.
 *
 * @includeExample ./packages/json-api-nestjs/examples/query.ts
 *
 * @see [Usage example](../../../examples/query.ts)
 * @see {@link https://jsonapi.org/format/#fetching-sorting JSON:API sorting}
 */
export function createSort<const FieldT extends readonly [Field, ...Field[]]>(fields: FieldT) {
  const fieldSet = new Set(fields);
  return {
    sort: z
      .preprocess(splitString, z.array(z.string()).optional())
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
            break;
          }
        }
      })
      .transform((value) => value as Array<`-${FieldT[number]}` | FieldT[number]> | undefined),
  };
}
