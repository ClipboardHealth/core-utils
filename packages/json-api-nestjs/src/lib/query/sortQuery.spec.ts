import {
  expectToBeSafeParseError,
  expectToBeSafeParseSuccess,
} from "@clipboard-health/testing-core";
import { z } from "zod";

import { sortQuery } from "./sortQuery";

describe("sortQuery", () => {
  const sortSchema = z.object(sortQuery(["age", "dateOfBirth"])).strict();

  describe("success cases", () => {
    it.each<{ expected: { sort?: string[] }; input: { sort?: string }; name: string }>([
      {
        name: "accepts valid sort parameters",
        input: { sort: "age" },
        expected: { sort: ["age"] },
      },
      {
        name: "allows descending sort with '-' prefix",
        input: { sort: "-age,dateOfBirth" },
        expected: { sort: ["-age", "dateOfBirth"] },
      },
      {
        name: "allows omitting sort parameter",
        input: {},
        expected: {},
      },
    ])("$name", ({ input, expected }) => {
      const actual = sortSchema.safeParse(input);

      expectToBeSafeParseSuccess(actual);
      expect(actual.data).toEqual(expected);
    });
  });

  describe("error cases", () => {
    it.each<{ expectedError: string; input: unknown; name: string }>([
      {
        name: "rejects invalid sort fields",
        input: { sort: "-age,invalid" },
        expectedError: "Invalid sort field: 'invalid'",
      },
      {
        name: "rejects on empty sort parameter",
        input: { sort: "" },
        expectedError: "Invalid sort field: ''",
      },
      {
        name: "rejects non-string sort parameter",
        input: { sort: 123 },
        expectedError: "Expected array, received number",
      },
      {
        name: "rejects invalid API type",
        input: { invalid: "age" },
        expectedError: "Unrecognized key(s) in object: 'invalid'",
      },
    ])("$name", ({ input, expectedError }) => {
      const actual = sortSchema.safeParse(input);

      expectToBeSafeParseError(actual);
      expect(actual.error.message).toContain(expectedError);
    });
  });
});
