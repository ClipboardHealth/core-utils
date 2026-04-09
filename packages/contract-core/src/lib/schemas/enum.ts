import { z } from "zod";

type EnumValues = readonly [string, ...string[]];

/**
 * A business-context-neutral sentinel returned when an enum field
 * receives a value the consumer does not recognize.
 */
export const ENUM_FALLBACK = "UNRECOGNIZED_" as const;
type EnumFallback = typeof ENUM_FALLBACK;

/**
 * @internal Do not use this function directly.
 * Use `requiredEnumWithFallback` or `optionalEnumWithFallback` instead.
 * Enum + "invalid -> UNRECOGNIZED_" with optionality toggle.
 * - If optional=true: undefined stays undefined
 * - If optional=false: undefined is rejected (normal enum behavior)
 * - Invalid values are coerced to ENUM_FALLBACK ("UNRECOGNIZED_")
 */
export function enumWithFallback<const V extends EnumValues>(
  values: V,
  options?: { optional?: false },
): z.ZodEffects<z.ZodEnum<[...V, EnumFallback]>, V[number] | EnumFallback, unknown>;

export function enumWithFallback<const V extends EnumValues>(
  values: V,
  options: { optional: true },
): z.ZodEffects<
  z.ZodOptional<z.ZodEnum<[...V, EnumFallback]>>,
  V[number] | EnumFallback | undefined,
  unknown
>;

export function enumWithFallback<const V extends EnumValues>(
  values: V,
  options: { optional?: boolean } = {},
) {
  if ((values as readonly string[]).includes(ENUM_FALLBACK)) {
    throw new Error(
      `Enum values must not include "${ENUM_FALLBACK}". It is appended automatically.`,
    );
  }

  const OriginalEnum = z.enum([...values]);
  const ExpandedEnum = z.enum([...values, ENUM_FALLBACK]);
  const optional = options.optional ?? false;
  const schema = optional ? ExpandedEnum.optional() : ExpandedEnum;

  // eslint-disable-next-line @typescript-eslint/no-unsafe-return
  return z.preprocess((value) => {
    if (value === undefined) {
      return optional ? undefined : value;
    }

    return OriginalEnum.safeParse(value).success ? value : ENUM_FALLBACK;
  }, schema);
}

export function requiredEnumWithFallback<const V extends EnumValues>(values: V) {
  return enumWithFallback(values, { optional: false });
}

export function optionalEnumWithFallback<const V extends EnumValues>(values: V) {
  return enumWithFallback(values, { optional: true });
}

export function requiredEnum<const V extends EnumValues>(values: V): z.ZodEnum<[...V]> {
  return z.enum([...values]);
}

export function optionalEnum<const V extends EnumValues>(
  values: V,
): z.ZodOptional<z.ZodEnum<[...V]>> {
  return z.enum([...values]).optional();
}
