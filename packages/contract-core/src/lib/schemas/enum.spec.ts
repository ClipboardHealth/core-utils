import {
  expectToBeSafeParseError,
  expectToBeSafeParseSuccess,
} from "@clipboard-health/testing-core";

import {
  ENUM_FALLBACK,
  enumWithFallback,
  optionalEnum,
  optionalEnumWithFallback,
  requiredEnum,
  requiredEnumWithFallback,
} from "./enum";

const VALUES = ["a", "b", "c"] as const;

describe(requiredEnumWithFallback, () => {
  const schema = requiredEnumWithFallback([...VALUES]);

  describe("success cases", () => {
    it.each<{ expected: string; input: unknown; name: string }>([
      { name: "accepts valid enum value 'a'", input: "a", expected: "a" },
      { name: "accepts valid enum value 'b'", input: "b", expected: "b" },
      { name: "accepts valid enum value 'c'", input: "c", expected: "c" },
      {
        name: "falls back for invalid string",
        input: "invalid",
        expected: ENUM_FALLBACK,
      },
      {
        name: "falls back for non-string input",
        input: 123,
        expected: ENUM_FALLBACK,
      },
      { name: "falls back for null", input: null, expected: ENUM_FALLBACK },
      { name: "falls back for object", input: {}, expected: ENUM_FALLBACK },
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

describe(optionalEnumWithFallback, () => {
  const schema = optionalEnumWithFallback([...VALUES]);

  describe("success cases", () => {
    it.each<{ expected: string | undefined; input: unknown; name: string }>([
      { name: "accepts valid enum value 'a'", input: "a", expected: "a" },
      { name: "accepts valid enum value 'b'", input: "b", expected: "b" },
      { name: "accepts valid enum value 'c'", input: "c", expected: "c" },
      { name: "accepts undefined", input: undefined, expected: undefined },
      {
        name: "falls back for invalid string",
        input: "invalid",
        expected: ENUM_FALLBACK,
      },
      {
        name: "falls back for non-string input",
        input: 123,
        expected: ENUM_FALLBACK,
      },
      { name: "falls back for null", input: null, expected: ENUM_FALLBACK },
      { name: "falls back for object", input: {}, expected: ENUM_FALLBACK },
    ])("$name", ({ input, expected }) => {
      const actual = schema.safeParse(input);

      expectToBeSafeParseSuccess(actual);
      expect(actual.data).toBe(expected);
    });
  });
});

describe(enumWithFallback, () => {
  it("throws if values include ENUM_FALLBACK", () => {
    expect(() => enumWithFallback(["a", ENUM_FALLBACK])).toThrow(
      `Enum values must not include "${ENUM_FALLBACK}"`,
    );
  });

  describe("with { optional: true }", () => {
    const schema = enumWithFallback([...VALUES], { optional: true });

    it("accepts undefined", () => {
      // eslint-disable-next-line unicorn/no-useless-undefined
      const actual = schema.safeParse(undefined);

      expectToBeSafeParseSuccess(actual);
      expect(actual.data).toBeUndefined();
    });

    it("falls back for invalid value", () => {
      const actual = schema.safeParse("invalid");

      expectToBeSafeParseSuccess(actual);
      expect(actual.data).toBe(ENUM_FALLBACK);
    });
  });

  describe("with { optional: false }", () => {
    const schema = enumWithFallback([...VALUES], { optional: false });

    it("rejects undefined", () => {
      // eslint-disable-next-line unicorn/no-useless-undefined
      const actual = schema.safeParse(undefined);

      expectToBeSafeParseError(actual);
      expect(actual.error.message).toContain("Required");
    });

    it("falls back for invalid value", () => {
      const actual = schema.safeParse("invalid");

      expectToBeSafeParseSuccess(actual);
      expect(actual.data).toBe(ENUM_FALLBACK);
    });
  });

  describe("with no options (defaults to required)", () => {
    const schema = enumWithFallback([...VALUES]);

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

describe(requiredEnum, () => {
  const schema = requiredEnum([...VALUES]);

  describe("success cases", () => {
    it.each<{ expected: string; input: unknown; name: string }>([
      { name: "accepts valid enum value 'a'", input: "a", expected: "a" },
      { name: "accepts valid enum value 'b'", input: "b", expected: "b" },
      { name: "accepts valid enum value 'c'", input: "c", expected: "c" },
    ])("$name", ({ input, expected }) => {
      const actual = schema.safeParse(input);

      expectToBeSafeParseSuccess(actual);
      expect(actual.data).toBe(expected);
    });
  });

  describe("error cases", () => {
    it.each<{ input: unknown; name: string }>([
      { name: "rejects undefined", input: undefined },
      { name: "rejects invalid string", input: "invalid" },
      { name: "rejects non-string input", input: 123 },
      { name: "rejects null", input: null },
      { name: "rejects object", input: {} },
    ])("$name", ({ input }) => {
      const actual = schema.safeParse(input);

      expectToBeSafeParseError(actual);
    });
  });
});

describe(optionalEnum, () => {
  const schema = optionalEnum([...VALUES]);

  describe("success cases", () => {
    it.each<{ expected: string | undefined; input: unknown; name: string }>([
      { name: "accepts valid enum value 'a'", input: "a", expected: "a" },
      { name: "accepts valid enum value 'b'", input: "b", expected: "b" },
      { name: "accepts valid enum value 'c'", input: "c", expected: "c" },
      { name: "accepts undefined", input: undefined, expected: undefined },
    ])("$name", ({ input, expected }) => {
      const actual = schema.safeParse(input);

      expectToBeSafeParseSuccess(actual);
      expect(actual.data).toBe(expected);
    });
  });

  describe("error cases", () => {
    it.each<{ input: unknown; name: string }>([
      { name: "rejects invalid string", input: "invalid" },
      { name: "rejects non-string input", input: 123 },
      { name: "rejects null", input: null },
      { name: "rejects object", input: {} },
    ])("$name", ({ input }) => {
      const actual = schema.safeParse(input);

      expectToBeSafeParseError(actual);
    });
  });
});

describe("rejects widened string[] at compile time", () => {
  const widened = ["a", "b"];

  it("requiredEnum", () => {
    // @ts-expect-error: widened string[] should not be accepted
    const schema = requiredEnum(widened);
    expect(schema).toBeDefined();
  });

  it("optionalEnum", () => {
    // @ts-expect-error: widened string[] should not be accepted
    const schema = optionalEnum(widened);
    expect(schema).toBeDefined();
  });

  it("requiredEnumWithFallback", () => {
    // @ts-expect-error: widened string[] should not be accepted
    const schema = requiredEnumWithFallback(widened);
    expect(schema).toBeDefined();
  });

  it("optionalEnumWithFallback", () => {
    // @ts-expect-error: widened string[] should not be accepted
    const schema = optionalEnumWithFallback(widened);
    expect(schema).toBeDefined();
  });
});

describe("accepts readonly values directly without spreading", () => {
  const STATUSES = ["active", "inactive"] as const;
  // Simulates a new enum value the producer added but this consumer
  // doesn't recognize yet; fallback helpers coerce it to ENUM_FALLBACK.
  const UNRECOGNIZED_VALUE = "deleted";

  it("requiredEnumWithFallback coerces unknown values to ENUM_FALLBACK", () => {
    const schema = requiredEnumWithFallback(STATUSES);

    const valid = schema.safeParse("active");
    expectToBeSafeParseSuccess(valid);
    expect(valid.data).toBe("active");

    const unknown = schema.safeParse(UNRECOGNIZED_VALUE);
    expectToBeSafeParseSuccess(unknown);
    expect(unknown.data).toBe(ENUM_FALLBACK);

    // eslint-disable-next-line unicorn/no-useless-undefined
    expectToBeSafeParseError(schema.safeParse(undefined));
  });

  it("optionalEnumWithFallback coerces unknown values to ENUM_FALLBACK and allows undefined", () => {
    const schema = optionalEnumWithFallback(STATUSES);

    const valid = schema.safeParse("active");
    expectToBeSafeParseSuccess(valid);
    expect(valid.data).toBe("active");

    const unknown = schema.safeParse(UNRECOGNIZED_VALUE);
    expectToBeSafeParseSuccess(unknown);
    expect(unknown.data).toBe(ENUM_FALLBACK);

    // eslint-disable-next-line unicorn/no-useless-undefined
    const undef = schema.safeParse(undefined);
    expectToBeSafeParseSuccess(undef);
    expect(undef.data).toBeUndefined();
  });

  it("requiredEnum rejects unknown values", () => {
    const schema = requiredEnum(STATUSES);

    const valid = schema.safeParse("active");
    expectToBeSafeParseSuccess(valid);
    expect(valid.data).toBe("active");

    expectToBeSafeParseError(schema.safeParse(UNRECOGNIZED_VALUE));
  });

  it("optionalEnum allows undefined but rejects unknown values", () => {
    const schema = optionalEnum(STATUSES);

    const valid = schema.safeParse("active");
    expectToBeSafeParseSuccess(valid);
    expect(valid.data).toBe("active");

    // eslint-disable-next-line unicorn/no-useless-undefined
    const undef = schema.safeParse(undefined);
    expectToBeSafeParseSuccess(undef);
    expect(undef.data).toBeUndefined();

    expectToBeSafeParseError(schema.safeParse(UNRECOGNIZED_VALUE));
  });
});
