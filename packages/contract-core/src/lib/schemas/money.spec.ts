import { type ZodError } from "zod";

import { money } from "./money";

describe("money schema", () => {
  it("validates the data", () => {
    let issues: unknown = [];
    try {
      money.parse({
        amount: 100,
        currencyCode: "EUR",
      });
    } catch (error: unknown) {
      const zodError = error as ZodError;
      issues = zodError.errors;
    }

    expect(issues).toMatchObject([
      {
        path: ["amountInMinorUnits"],
        code: "invalid_type",
        message: "Required",
        expected: "number",
        received: "undefined",
      },
      {
        path: ["currencyCode"],
        code: "invalid_enum_value",
        message: "Invalid enum value. Expected 'USD', received 'EUR'",
        received: "EUR",
      },
    ]);
  });
});
