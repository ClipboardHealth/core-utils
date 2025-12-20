import { z } from "zod";

type EnumValues = [string, ...string[]];

/**
 * Enum + "invalid -> fallback" with optionality toggle.
 * - If optional=true: undefined stays undefined
 * - If optional=false: undefined is rejected (normal enum behavior)
 * - Fallback must be a member of the enum
 */
function enumWithFallback<const V extends EnumValues, const F extends V[number]>(
  values: V,
  fallback: F,
  options?: { optional?: false },
): z.ZodEffects<z.ZodEnum<V>, V[number], unknown>;

function enumWithFallback<const V extends EnumValues, const F extends V[number]>(
  values: V,
  fallback: F,
  options: { optional: true },
): z.ZodEffects<z.ZodOptional<z.ZodEnum<V>>, V[number] | undefined, unknown>;

function enumWithFallback<const V extends EnumValues, const F extends V[number]>(
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

// Argument of type '"d"' is not assignable to parameter of type '"a" | "b" | "c"'.ts(2345)
// const testUnassignableFallbackSchema = requiredEnumWithFallback(["a", "b", "c"], "d");

// type TestAssignableFallback = "a" | "b" | "c"
// const testAssignableFallbackSchema = requiredEnumWithFallback(["a", "b", "c"], "a");
// type TestAssignableFallback = z.infer<typeof testAssignableFallbackSchema>;

// type TestOptionalFallback = "a" | "b" | "c" | undefined
// const testOptionalFallbackSchema = optionalEnumWithFallback(["a", "b", "c"], "a");
// type TestOptionalFallback = z.infer<typeof testOptionalFallbackSchema>;
