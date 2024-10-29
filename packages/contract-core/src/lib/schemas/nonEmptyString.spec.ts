import {
  expectToBeSafeParseError,
  expectToBeSafeParseSuccess,
} from "@clipboard-health/testing-core";

import { nonEmptyString } from "./nonEmptyString";

describe("nonEmptyString", () => {
  describe("success cases", () => {
    it.each<{ input: string; name: string }>([
      { name: "accepts non-empty string", input: "hi" },
      { name: "accepts string with spaces", input: "  hi  " },
      { name: "accepts string with special characters", input: "!@#$%" },
    ])("$name", ({ input }) => {
      const actual = nonEmptyString.safeParse(input);

      expectToBeSafeParseSuccess(actual);
      expect(actual.data).toBe(input);
    });
  });

  describe("error cases", () => {
    it.each<{ expectedError: string; input: unknown; name: string }>([
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

      expectToBeSafeParseError(actual);
      expect(actual.error.message).toContain(expectedError);
    });
  });
});
