import {
  expectToBeSafeParseError,
  expectToBeSafeParseSuccess,
} from "@clipboard-health/testing-core";
import { z } from "zod";

import { nonEmptyArray } from "./nonEmptyArray";

describe("nonEmptyArray.safeParse", () => {
  const schema = nonEmptyArray(z.string());

  describe("success cases", () => {
    it.each<{ input: string[]; name: string }>([
      { name: "accepts single-element array", input: ["a"] },
      { name: "accepts multi-element array", input: ["a", "b", "c"] },
    ])("$name", ({ input }) => {
      const actual = schema.safeParse(input);

      expectToBeSafeParseSuccess(actual);
      expect(actual.data).toStrictEqual(input);
    });
  });

  describe("error cases", () => {
    it.each<{ expectedError: string; input: unknown; name: string }>([
      {
        name: "rejects empty array",
        input: [],
        expectedError: "Array must contain at least 1 element(s)",
      },
      {
        name: "rejects non-array input (string)",
        input: "a",
        expectedError: "Expected array, received string",
      },
      {
        name: "rejects non-array input (number)",
        input: 1,
        expectedError: "Expected array, received number",
      },
      {
        name: "rejects non-array input (undefined)",
        input: undefined,
        expectedError: "Required",
      },
    ])("$name", ({ input, expectedError }) => {
      const actual = schema.safeParse(input);

      expectToBeSafeParseError(actual);
      expect(actual.error.message).toContain(expectedError);
    });

    it("rejects array with element failing inner schema", () => {
      const actual = schema.safeParse(["a", 1]);

      expectToBeSafeParseError(actual);
      expect(actual.error.message).toContain("Expected string, received number");
    });
  });
});

describe("nonEmptyArray type", () => {
  it("infers output as a non-empty tuple", () => {
    const schema = nonEmptyArray(z.string());
    type Output = z.output<typeof schema>;

    const value: Output = ["a"];
    const [first] = value;
    const firstString: string = first;

    expect(firstString).toBe("a");
  });
});
