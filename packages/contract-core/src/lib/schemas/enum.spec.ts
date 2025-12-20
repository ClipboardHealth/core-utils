import {
  expectToBeSafeParseError,
  expectToBeSafeParseSuccess,
} from "@clipboard-health/testing-core";

import { enumWithFallback, optionalEnumWithFallback, requiredEnumWithFallback } from "./enum";

const VALUES = ["a", "b", "c"] as const;
const FALLBACK = "a";

describe("requiredEnumWithFallback", () => {
  const schema = requiredEnumWithFallback([...VALUES], FALLBACK);

  describe("success cases", () => {
    it.each<{ expected: string; input: unknown; name: string }>([
      { name: "accepts valid enum value 'a'", input: "a", expected: "a" },
      { name: "accepts valid enum value 'b'", input: "b", expected: "b" },
      { name: "accepts valid enum value 'c'", input: "c", expected: "c" },
      {
        name: "falls back for invalid string",
        input: "invalid",
        expected: FALLBACK,
      },
      {
        name: "falls back for non-string input",
        input: 123,
        expected: FALLBACK,
      },
      { name: "falls back for null", input: null, expected: FALLBACK },
      { name: "falls back for object", input: {}, expected: FALLBACK },
    ])("$name", ({ input, expected }) => {
      const actual = schema.safeParse(input);

      expectToBeSafeParseSuccess(actual);
      expect(actual.data).toBe(expected);
    });
  });

  describe("error cases", () => {
    it("rejects undefined", () => {
      // eslint-disable-next-line unicorn/no-useless-undefined
      const actual = schema.safeParse(undefined);

      expectToBeSafeParseError(actual);
      expect(actual.error.message).toContain("Required");
    });
  });
});

describe("optionalEnumWithFallback", () => {
  const schema = optionalEnumWithFallback([...VALUES], FALLBACK);

  describe("success cases", () => {
    it.each<{ expected: string | undefined; input: unknown; name: string }>([
      { name: "accepts valid enum value 'a'", input: "a", expected: "a" },
      { name: "accepts valid enum value 'b'", input: "b", expected: "b" },
      { name: "accepts valid enum value 'c'", input: "c", expected: "c" },
      { name: "accepts undefined", input: undefined, expected: undefined },
      {
        name: "falls back for invalid string",
        input: "invalid",
        expected: FALLBACK,
      },
      {
        name: "falls back for non-string input",
        input: 123,
        expected: FALLBACK,
      },
      { name: "falls back for null", input: null, expected: FALLBACK },
      { name: "falls back for object", input: {}, expected: FALLBACK },
    ])("$name", ({ input, expected }) => {
      const actual = schema.safeParse(input);

      expectToBeSafeParseSuccess(actual);
      expect(actual.data).toBe(expected);
    });
  });
});

describe("enumWithFallback", () => {
  describe("with { optional: true }", () => {
    const schema = enumWithFallback([...VALUES], FALLBACK, { optional: true });

    it("accepts undefined", () => {
      // eslint-disable-next-line unicorn/no-useless-undefined
      const actual = schema.safeParse(undefined);

      expectToBeSafeParseSuccess(actual);
      expect(actual.data).toBeUndefined();
    });

    it("falls back for invalid value", () => {
      const actual = schema.safeParse("invalid");

      expectToBeSafeParseSuccess(actual);
      expect(actual.data).toBe(FALLBACK);
    });
  });

  describe("with { optional: false }", () => {
    const schema = enumWithFallback([...VALUES], FALLBACK, { optional: false });

    it("rejects undefined", () => {
      // eslint-disable-next-line unicorn/no-useless-undefined
      const actual = schema.safeParse(undefined);

      expectToBeSafeParseError(actual);
      expect(actual.error.message).toContain("Required");
    });

    it("falls back for invalid value", () => {
      const actual = schema.safeParse("invalid");

      expectToBeSafeParseSuccess(actual);
      expect(actual.data).toBe(FALLBACK);
    });
  });

  describe("with no options (defaults to required)", () => {
    const schema = enumWithFallback([...VALUES], FALLBACK);

    it("rejects undefined", () => {
      // eslint-disable-next-line unicorn/no-useless-undefined
      const actual = schema.safeParse(undefined);

      expectToBeSafeParseError(actual);
      expect(actual.error.message).toContain("Required");
    });

    it("accepts valid enum value", () => {
      const actual = schema.safeParse("b");

      expectToBeSafeParseSuccess(actual);
      expect(actual.data).toBe("b");
    });
  });
});
