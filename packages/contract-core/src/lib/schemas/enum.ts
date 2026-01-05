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

/**
 * Creates a required enum schema that performs strict validation.
 * Invalid values will fail validation rather than being coerced to a fallback.
 *
 * Use this when:
 * - User types and authentication scenarios where invalid values should fail validation
 * - Critical business logic where coalescing could hide data quality issues
 * - API contract validation where all parties should use current enum values
 * - Strict validation is required without fallback behavior
 *
 * @example
 * const statusSchema = requiredEnum(["pending", "completed", "failed"]);
 * statusSchema.parse("pending"); // => "pending"
 * statusSchema.parse("invalid"); // => throws ZodError
 * statusSchema.parse(undefined); // => throws ZodError
 */
export function requiredEnum<const V extends EnumValues>(values: V): z.ZodEnum<V> {
  return z.enum(values);
}

/**
 * Creates an optional enum schema that performs strict validation.
 * Invalid values will fail validation rather than being coerced to a fallback.
 * Undefined values are allowed and pass through as undefined.
 *
 * Use this when:
 * - User types and authentication scenarios where invalid values should fail validation
 * - Critical business logic where coalescing could hide data quality issues
 * - API contract validation where all parties should use current enum values
 * - Strict validation is required without fallback behavior
 * - The field is optional and undefined is a valid value
 *
 * @example
 * const statusSchema = optionalEnum(["pending", "completed", "failed"]);
 * statusSchema.parse("pending"); // => "pending"
 * statusSchema.parse(undefined); // => undefined
 * statusSchema.parse("invalid"); // => throws ZodError
 */
export function optionalEnum<const V extends EnumValues>(values: V): z.ZodOptional<z.ZodEnum<V>> {
  return z.enum(values).optional();
}
