import { expectToBeError, expectToBeSuccess } from "../test";
import { type BooleanString, booleanString, nonEmptyString, toBoolean } from "./schemas";

describe("nonEmptyString", () => {
  describe("success cases", () => {
    it.each<{ name: string; input: string }>([
      { name: "accepts non-empty string", input: "hi" },
      { name: "accepts string with spaces", input: "  hi  " },
      { name: "accepts string with special characters", input: "!@#$%" },
    ])("$name", ({ input }) => {
      const actual = nonEmptyString.safeParse(input);

      expectToBeSuccess(actual);
      expect(actual.data).toBe(input);
    });
  });

  describe("error cases", () => {
    it.each<{ name: string; input: unknown; expectedError: string }>([
      {
        name: "rejects empty string",
        input: "",
        expectedError: "String must contain at least 1 character(s)",
      },
      {
        name: "rejects non-string input (number)",
        input: 123,
        expectedError: "Expected string, received number",
      },
      {
        name: "rejects non-string input (boolean)",
        input: true,
        expectedError: "Expected string, received boolean",
      },
      {
        name: "rejects non-string input (undefined)",
        input: undefined,
        expectedError: "Required",
      },
    ])("$name", ({ input, expectedError }) => {
      const actual = nonEmptyString.safeParse(input);

      expectToBeError(actual);
      expect(actual.error.message).toContain(expectedError);
    });
  });
});

describe("booleanString", () => {
  describe("success cases", () => {
    it.each<{ name: string; input: string; expected: string }>([
      { name: "transforms 'true' to boolean true", input: "true", expected: "true" },
      { name: "transforms 'false' to boolean false", input: "false", expected: "false" },
    ])("$name", ({ input, expected }) => {
      const actual = booleanString.safeParse(input);

      expectToBeSuccess(actual);
      expect(actual.data).toBe(expected);
    });
  });

  describe("error cases", () => {
    it.each<{ name: string; input: unknown; expectedError: string }>([
      {
        name: "rejects invalid string input",
        input: "invalid",
        expectedError: "Invalid enum value. Expected 'true' | 'false', received 'invalid'",
      },
      {
        name: "rejects non-string input",
        input: true,
        expectedError: "Expected 'true' | 'false', received boolean",
      },
      {
        name: "rejects non-string input",
        input: "True",
        expectedError: "Invalid enum value. Expected 'true' | 'false', received 'True'",
      },
    ])("$name", ({ input, expectedError }) => {
      const actual = booleanString.safeParse(input);

      expectToBeError(actual);
      expect(actual.error.message).toContain(expectedError);
    });
  });
});

describe("toBoolean", () => {
  it.each<{ input: BooleanString; expected: boolean }>([
    { input: "true", expected: true },
    { input: "false", expected: false },
    { input: "True" as BooleanString, expected: false },
  ])("converts '$input' to boolean $expected", ({ input, expected }) => {
    expect(toBoolean(input)).toBe(expected);
  });
});
