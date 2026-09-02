import { z } from "zod";

import { ENUM_FALLBACK } from "./enum";

type DiscriminatorValues = readonly [string, ...string[]];
type NarrowValues<Values extends DiscriminatorValues> = string extends Values[number]
  ? never
  : Values;

type Variants<Key extends string, Values extends DiscriminatorValues> = {
  [Value in Values[number]]: z.ZodObject<Record<Key, z.ZodLiteral<Value>> & z.ZodRawShape>;
};

/**
 * Resolves to `never` for any variant whose key is absent from `values`. Such a variant would be
 * dropped at build time and its discriminator would read as `ENUM_FALLBACK`.
 */
type OrphanedVariants<Schemas, Values extends DiscriminatorValues> = Record<
  Exclude<keyof Schemas, Values[number]>,
  never
>;

type UnrecognizedVariant<Key extends string> = Record<Key, typeof ENUM_FALLBACK>;

/**
 * Builds a request/response pair for a discriminated union whose variant set grows over time.
 *
 * `request` is a `z.discriminatedUnion` of the known variants, each made `.strict()`: an unknown
 * discriminator, an unknown key, a missing field, or an invalid value is rejected.
 *
 * `response` is a `z.union` of the known variants, each made `.strip()`, plus an unrecognized
 * variant carrying the discriminator alone. An unknown discriminator collapses to
 * `{ [discriminator]: ENUM_FALLBACK }` so a future variant parses instead of failing, while a known
 * discriminator with a missing field or invalid value still fails.
 *
 * The helper owns strictness on both sides, so an already-`.strict()` variant still yields a
 * stripping response branch. Only top-level discriminators are supported.
 *
 * `values` and `variants` must line up exactly, and each variant must declare `z.literal` of its own
 * key. A value with no variant, a variant with no value, and a mismatched or missing literal are all
 * compile errors. That is the point: a variant must never silently read as `ENUM_FALLBACK`.
 *
 * ```ts
 * const { request, response } = discriminatedUnionWithFallback("type", TRIGGER_TYPES, {
 *   DNR_COUNT: z.object({
 *     type: z.literal("DNR_COUNT"),
 *     dnrCount: z.number().int().positive(),
 *   }),
 * });
 * ```
 */
export function discriminatedUnionWithFallback<
  const Key extends string,
  const Values extends DiscriminatorValues,
  const Schemas extends Variants<Key, Values>,
>(
  discriminator: Key,
  values: NarrowValues<Values>,
  variants: Schemas & OrphanedVariants<Schemas, Values>,
): {
  request: z.ZodType<
    z.output<Schemas[Values[number]]>,
    z.ZodTypeDef,
    z.input<Schemas[Values[number]]>
  >;
  response: z.ZodType<
    z.output<Schemas[Values[number]]> | UnrecognizedVariant<Key>,
    z.ZodTypeDef,
    z.input<Schemas[Values[number]]>
  >;
};

export function discriminatedUnionWithFallback(
  discriminator: string,
  values: DiscriminatorValues,
  variants: Record<string, z.AnyZodObject>,
) {
  if ((values as readonly string[]).includes(ENUM_FALLBACK)) {
    throw new Error(`Discriminator values must not include "${ENUM_FALLBACK}".`);
  }

  const known = new Set<string>(values);
  const orphaned = Object.keys(variants).find((key) => !known.has(key));
  if (orphaned !== undefined) {
    throw new Error(`Variant "${orphaned}" is missing from the discriminator values.`);
  }

  const [firstValue, ...restValues] = values;
  const first = variantFor({ discriminator, value: firstValue, variants });
  const rest = restValues.map((value) => variantFor({ discriminator, value, variants }));

  return {
    request: z.discriminatedUnion(discriminator, [
      first.strict(),
      ...rest.map((variant) => variant.strict()),
    ]),
    response: z.union([
      first.strip(),
      unrecognizedVariant({ discriminator, known }),
      ...rest.map((variant) => variant.strip()),
    ]),
  };
}

function variantFor(options: {
  discriminator: string;
  value: string;
  variants: Record<string, z.AnyZodObject>;
}): z.AnyZodObject {
  const { discriminator, value, variants } = options;

  const variant = variants[value];
  if (variant === undefined) {
    throw new Error(`Missing variant schema for discriminator value "${value}".`);
  }

  const literal: unknown = variant.shape[discriminator];
  if (!(literal instanceof z.ZodLiteral) || (literal.value as unknown) !== value) {
    throw new Error(
      `Variant "${value}" must declare ${discriminator}: z.literal("${value}") in its shape.`,
    );
  }

  return variant;
}

function unrecognizedVariant(options: {
  discriminator: string;
  known: ReadonlySet<string>;
}): z.AnyZodObject {
  const { discriminator, known } = options;

  return z.object({
    [discriminator]: z
      .string()
      .refine((value) => !known.has(value))
      .transform(() => ENUM_FALLBACK),
  });
}
