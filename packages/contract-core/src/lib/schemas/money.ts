import { z } from "zod";

/**
 * Currency code that follows the ISO 4217 standard.
 */
export const currencyCode = z.enum(["USD"]);

export const money = z.object({
  amountInMinorUnits: z.number().int(),
  currencyCode,
});
