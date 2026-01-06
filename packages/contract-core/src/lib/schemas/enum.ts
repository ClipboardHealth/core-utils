import { z } from "zod";

type EnumValues = [string, ...string[]];

/**
 * @internal Do not use this function directly.
 * Use `requiredEnumWithFallback` or `optionalEnumWithFallback` instead.
 * Enum + "invalid -> fallback" with optionality toggle.
 * - If optional=true: undefined stays undefined
 * - If optional=false: undefined is rejected (normal enum behavior)
 * - Fallback must be a member of the enum
 */
export function enumWithFallback<const V extends EnumValues, const F extends V[number]>(
  values: V,
  fallback: F,
  options?: { optional?: false },
): z.ZodEffects<z.ZodEnum<V>, V[number], unknown>;

export function enumWithFallback<const V extends EnumValues, const F extends V[number]>(
  values: V,
  fallback: F,
  options: { optional: true },
): z.ZodEffects<z.ZodOptional<z.ZodEnum<V>>, V[number] | undefined, unknown>;

export function enumWithFallback<const V extends EnumValues, const F extends V[number]>(
  values: V,
  fallback: F,
  options: { optional?: boolean } = {},
) {
  const Enum = z.enum(values);
  const optional = options.optional ?? false;
  const schema = optional ? Enum.optional() : Enum;

  return z.preprocess((value) => {
    if (value === undefined) {
      return optional ? undefined : value;
    }
    return Enum.safeParse(value).success ? value : fallback;
  }, schema);
}

export const optionalEnumWithFallback = <const V extends EnumValues, const F extends V[number]>(
  values: V,
  fallback: F,
) => enumWithFallback(values, fallback, { optional: true });

export const requiredEnumWithFallback = <const V extends EnumValues, const F extends V[number]>(
  values: V,
  fallback: F,
) => enumWithFallback(values, fallback, { optional: false });

export function requiredEnum<const V extends EnumValues>(values: V): z.ZodEnum<V> {
  return z.enum(values);
}

export function optionalEnum<const V extends EnumValues>(values: V): z.ZodOptional<z.ZodEnum<V>> {
  return z.enum(values).optional();
}
