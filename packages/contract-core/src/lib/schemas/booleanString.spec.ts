import {
  expectToBeSafeParseError,
  expectToBeSafeParseSuccess,
} from "@clipboard-health/testing-core";

import { type BooleanString, booleanString, toBoolean } from "./booleanString";

describe("booleanString", () => {
  describe("success cases", () => {
    it.each<{ expected: string; input: string; name: string }>([
      { name: "transforms 'true' to boolean true", input: "true", expected: "true" },
      { name: "transforms 'false' to boolean false", input: "false", expected: "false" },
    ])("$name", ({ input, expected }) => {
      const actual = booleanString.safeParse(input);

      expectToBeSafeParseSuccess(actual);
      expect(actual.data).toBe(expected);
    });
  });

  describe("error cases", () => {
    it.each<{ expectedError: string; input: unknown; name: string }>([
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

      expectToBeSafeParseError(actual);
      expect(actual.error.message).toContain(expectedError);
    });
  });
});

describe("toBoolean", () => {
  it.each<{ expected: boolean; input: BooleanString }>([
    { input: "true", expected: true },
    { input: "false", expected: false },
    { input: "True" as BooleanString, expected: false },
  ])("converts '$input' to boolean $expected", ({ input, expected }) => {
    expect(toBoolean(input)).toBe(expected);
  });
});
