import { z } from "zod";

import { ENUM_FALLBACK } from "./enum";

type LiteralKeyedObject<Key extends string> = z.ZodObject<
  Record<Key, z.ZodLiteral<string>> & z.ZodRawShape
>;

type Variants<Key extends string> = readonly [
  LiteralKeyedObject<Key>,
  ...LiteralKeyedObject<Key>[],
];

type UnrecognizedVariant<Key extends string> = Record<Key, typeof ENUM_FALLBACK>;

/**
 * Builds a request/response pair for a discriminated union whose variant set grows over time. Takes
 * the same arguments as `z.discriminatedUnion`.
 *
 * `request` is a `z.discriminatedUnion` of the variants, each made `.strict()`: an unknown
 * discriminator, an unknown key, a missing field, or an invalid value is rejected.
 *
 * `response` is a `z.discriminatedUnion` of the variants, each made `.strip()`, plus a branch pinned
 * to `z.literal(ENUM_FALLBACK)`. An unknown discriminator is rewritten to
 * `{ [discriminator]: ENUM_FALLBACK }` before parsing so a future variant reads as the fallback
 * instead of failing. `z.union` cannot do this: its fallback branch matches any unknown value, so a
 * known variant with a missing field or invalid value reports an opaque `invalid_union` carrying one
 * nested error per branch. Discriminating first reports the issue on the offending field alone.
 *
 * The fallback branch carries the discriminator and nothing else, so a future variant can never fail
 * both the known branches and the fallback.
 *
 * The helper owns strictness on both sides, so an already-`.strict()` variant still yields a
 * stripping response branch. Only top-level discriminators are supported.
 *
 * Every variant must declare `z.literal` at the discriminator. That literal is the variant's
 * identity: a missing or non-literal discriminator is a compile error and throws at module load, and
 * `z.discriminatedUnion` itself rejects a duplicated value.
 *
 * ```ts
 * const { request, response } = discriminatedUnionWithFallback("channel", [
 *   z.object({
 *     channel: z.literal("EMAIL"),
 *     emailAddress: z.string().email(),
 *   }),
 * ]);
 * ```
 */
export function discriminatedUnionWithFallback<
  const Key extends string,
  const Schemas extends Variants<Key>,
>(
  discriminator: Key,
  variants: Schemas,
): {
  request: z.ZodType<z.output<Schemas[number]>, z.ZodTypeDef, z.input<Schemas[number]>>;
  response: z.ZodType<
    z.output<Schemas[number]> | UnrecognizedVariant<Key>,
    z.ZodTypeDef,
    z.input<Schemas[number]>
  >;
};

export function discriminatedUnionWithFallback(
  discriminator: string,
  variants: readonly [z.AnyZodObject, ...z.AnyZodObject[]],
) {
  const known = new Set(
    variants.map((variant, index) => discriminatorValue({ discriminator, index, variant })),
  );

  const [first, ...rest] = variants;

  const unknownDiscriminator = z.object({
    [discriminator]: z.string().refine((value) => !known.has(value)),
  });

  return {
    request: z.discriminatedUnion(discriminator, [
      first.strict(),
      ...rest.map((variant) => variant.strict()),
    ]),
    response: z.preprocess(
      (value) =>
        unknownDiscriminator.safeParse(value).success ? { [discriminator]: ENUM_FALLBACK } : value,
      z.discriminatedUnion(discriminator, [
        first.strip(),
        z.object({ [discriminator]: z.literal(ENUM_FALLBACK) }),
        ...rest.map((variant) => variant.strip()),
      ]),
    ),
  };
}

function discriminatorValue(options: {
  discriminator: string;
  index: number;
  variant: z.AnyZodObject;
}): string {
  const { discriminator, index, variant } = options;

  const literal: unknown = variant.shape[discriminator];
  if (!(literal instanceof z.ZodLiteral) || typeof literal.value !== "string") {
    throw new Error(
      `Variant at index ${index} must declare ${discriminator}: z.literal("<value>") in its shape.`,
    );
  }

  if (literal.value === ENUM_FALLBACK) {
    throw new Error(`Variant discriminators must not include "${ENUM_FALLBACK}".`);
  }

  return literal.value;
}
