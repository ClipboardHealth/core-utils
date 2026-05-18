import { z } from "zod";

/**
 * Currency code that follows the ISO 4217 standard.
 */
export const currencyCode = z.enum(["USD"]);

export const money = z.object({
  amountInMinorUnits: z.number().int(),
  currencyCode,
});

export type Money = z.infer<typeof money>;

export interface DollarOrMoneySchemaOptions {
  /**
   * Human-readable field name used in validation messages,
   * e.g. `"Hourly rate"` → `"Hourly rate must be a positive dollar amount"`.
   */
  label?: string;
}

function dollarsToMoneyDto(dollars: number): Money {
  return { amountInMinorUnits: Math.round(dollars * 100), currencyCode: "USD" };
}

/**
 * Accepts a positive USD dollar number or a canonical money object.
 * Output is always `{ amountInMinorUnits, currencyCode }`.
 *
 * Composable with `.optional()`, `.nullable()`, `.nullish()`, etc. at the call site:
 * ```ts
 * z.object({
 *   reportedHourlyRate: dollarOrMoneySchema({ label: "Hourly rate" }),
 *   listedHourlyRateAtReportTime: dollarOrMoneySchema({ label: "Hourly rate" })
 *     .nullish()
 *     .transform((value) => value ?? undefined),
 * });
 * ```
 *
 * z.input  → number | { amountInMinorUnits: number; currencyCode: "USD" }
 * z.output → { amountInMinorUnits: number; currencyCode: "USD" }
 */
export function dollarOrMoneySchema(options: DollarOrMoneySchemaOptions = {}) {
  const label = options.label ?? "Amount";
  const positiveMessage = `${label} must be a positive dollar amount`;
  const finiteMessage = `${label} must be a finite number`;
  const invalidMessage = `${label} must be a positive dollar amount or money object`;

  return z
    .unknown()
    .superRefine((value, context) => {
      if (typeof value === "number") {
        if (!Number.isFinite(value)) {
          context.addIssue({ code: z.ZodIssueCode.custom, message: finiteMessage });
          return;
        }

        if (value <= 0) {
          context.addIssue({ code: z.ZodIssueCode.custom, message: positiveMessage });
        }

        return;
      }

      if (
        value === null ||
        value === undefined ||
        typeof value !== "object" ||
        Array.isArray(value)
      ) {
        context.addIssue({ code: z.ZodIssueCode.custom, message: invalidMessage });
        return;
      }

      const parsed = money.safeParse(value);
      if (!parsed.success) {
        for (const issue of parsed.error.issues) {
          context.addIssue(issue);
        }
      }
    })
    .transform((value): Money => {
      if (typeof value === "number") {
        return dollarsToMoneyDto(value);
      }

      return money.parse(value);
    });
}
