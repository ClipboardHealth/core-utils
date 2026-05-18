import {
  expectToBeSafeParseError,
  expectToBeSafeParseSuccess,
} from "@clipboard-health/testing-core";
import type { ZodError } from "zod";

import { dollarOrMoneySchema, money } from "./money";

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

describe(dollarOrMoneySchema, () => {
  const schema = dollarOrMoneySchema();

  describe("success cases", () => {
    it("converts a positive dollar number to the money DTO", () => {
      const actual = schema.safeParse(45.5);

      expectToBeSafeParseSuccess(actual);
      expect(actual.data).toStrictEqual({
        amountInMinorUnits: 4550,
        currencyCode: "USD",
      });
    });

    it("passes through a valid money object", () => {
      const input = { amountInMinorUnits: 4500, currencyCode: "USD" as const };

      const actual = schema.safeParse(input);

      expectToBeSafeParseSuccess(actual);
      expect(actual.data).toStrictEqual(input);
    });
  });

  describe("error cases", () => {
    it.each<{ input: unknown; message: string; name: string }>([
      {
        name: "rejects zero",
        input: 0,
        message: "Amount must be a positive dollar amount",
      },
      {
        name: "rejects negative amounts",
        input: -15,
        message: "Amount must be a positive dollar amount",
      },
      {
        name: "rejects NaN",
        input: Number.NaN,
        message: "Amount must be a finite number",
      },
      {
        name: "rejects positive infinity",
        input: Number.POSITIVE_INFINITY,
        message: "Amount must be a finite number",
      },
      {
        name: "rejects negative infinity",
        input: Number.NEGATIVE_INFINITY,
        message: "Amount must be a finite number",
      },
    ])("$name", ({ input, message }) => {
      const actual = schema.safeParse(input);

      expectToBeSafeParseError(actual);
      expect(actual.error.issues.map((issue) => issue.message)).toContain(message);
      expect(actual.error.issues.map((issue) => issue.message)).not.toContain(
        "Expected object, received number",
      );
    });

    it.each<{ input: unknown; message: string; name: string }>([
      {
        name: "rejects string",
        input: "45",
        message: "Amount must be a positive dollar amount or money object",
      },
      {
        name: "rejects array",
        input: [45],
        message: "Amount must be a positive dollar amount or money object",
      },
      {
        name: "rejects null",
        input: null,
        message: "Amount must be a positive dollar amount or money object",
      },
      {
        name: "rejects undefined",
        input: undefined,
        message: "Amount must be a positive dollar amount or money object",
      },
    ])("$name", ({ input, message }) => {
      const actual = schema.safeParse(input);

      expectToBeSafeParseError(actual);
      expect(actual.error.issues.map((issue) => issue.message)).toContain(message);
      expect(actual.error.issues.map((issue) => issue.message)).not.toContain(
        "Expected object, received number",
      );
    });
  });

  describe("custom label", () => {
    it("uses the label in validation messages", () => {
      const labeledSchema = dollarOrMoneySchema({ label: "Hourly rate" });

      const actual = labeledSchema.safeParse(0);

      expectToBeSafeParseError(actual);
      expect(actual.error.issues.map((issue) => issue.message)).toContain(
        "Hourly rate must be a positive dollar amount",
      );
    });
  });

  describe("composability", () => {
    it("composes with .optional()", () => {
      const optionalSchema = dollarOrMoneySchema().optional();

      // eslint-disable-next-line unicorn/no-useless-undefined
      const undef = optionalSchema.safeParse(undefined);
      expectToBeSafeParseSuccess(undef);
      expect(undef.data).toBeUndefined();

      const valid = optionalSchema.safeParse(12);
      expectToBeSafeParseSuccess(valid);
      expect(valid.data).toStrictEqual({
        amountInMinorUnits: 1200,
        currencyCode: "USD",
      });
    });
  });
});
