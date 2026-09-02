import { z } from "zod";

import { ENUM_FALLBACK } from "./enum";

type LiteralKeyedObject<Key extends string> = z.ZodObject<
  Record<Key, z.ZodLiteral<string>> & z.ZodRawShape
>;

type Variants<Key extends string> = readonly [
  LiteralKeyedObject<Key>,
  ...Array<LiteralKeyedObject<Key>>,
];

type UnrecognizedVariant<Key extends string> = Record<Key, typeof ENUM_FALLBACK>;

/**
 * Builds a strict `request` and a forwards-compatible `response` for a discriminated union whose
 * variant set grows over time. Takes the same arguments as `z.discriminatedUnion`.
 *
 * `request` is the variants made `.strict()`. `response` is the variants made `.strip()` plus a
 * branch pinned to `z.literal(ENUM_FALLBACK)`, with an unknown discriminator rewritten to
 * `{ [discriminator]: ENUM_FALLBACK }` before parsing so a future variant reads as the fallback
 * instead of failing. Both still reject a known variant with a missing field or an invalid value.
 *
 * A `z.union` fallback branch matches any unknown value, so a failing known variant reports an
 * opaque `invalid_union`. Discriminating first names the offending field.
 *
 * Every variant must declare `z.literal` at the discriminator. The helper owns strictness at each
 * variant's top level, so an already-`.strict()` variant still yields a stripping response branch.
 * Only top-level discriminators are supported.
 *
 * ```ts
 * const { request, response } = discriminatedUnionWithFallback("channel", [
 *   z.object({ channel: z.literal("EMAIL"), emailAddress: z.string().email() }),
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
  response: z.ZodType<z.output<Schemas[number]> | UnrecognizedVariant<Key>, z.ZodTypeDef, unknown>;
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
        z.object({ [discriminator]: z.literal(ENUM_FALLBACK) }),
        ...variants.map((variant) => variant.strip()),
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
    throw new TypeError(
      `Variant at index ${index} must declare ${discriminator}: z.literal("<value>") in its shape.`,
    );
  }

  if (literal.value === ENUM_FALLBACK) {
    throw new Error(`Variant discriminators must not include "${ENUM_FALLBACK}".`);
  }

  return literal.value;
}
