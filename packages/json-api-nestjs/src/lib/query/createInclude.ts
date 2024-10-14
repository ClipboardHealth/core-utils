import { z } from "zod";

import { splitString } from "../internal/splitString";

/**
 * Creates a Zod schema for JSON:API include parameters.
 *
 * @param fields An array of valid include fields.
 * @returns A Zod schema for the include parameter.
 *
 * @see {@link https://jsonapi.org/format/#fetching-includes JSON:API includes}
 */
export function createInclude<const FieldT extends readonly string[]>(fields: FieldT) {
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
