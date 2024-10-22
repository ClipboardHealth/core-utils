import {
  expectToBeSafeParseError,
  expectToBeSafeParseSuccess,
} from "@clipboard-health/testing-core";
import { z } from "zod";

import { includeQuery } from "./includeQuery";

describe("includeQuery", () => {
  const includeSchema = z.object(includeQuery(["articles", "articles.comments"]));

  describe("success cases", () => {
    it.each<{ name: string; input: { include?: string }; expected: { include?: string[] } }>([
      {
        name: "accepts valid include parameters",
        input: { include: "articles" },
        expected: { include: ["articles"] },
      },
      {
        name: "accepts nested include parameters",
        input: { include: "articles.comments" },
        expected: { include: ["articles.comments"] },
      },
      {
        name: "allows omitting include parameter",
        input: {},
        expected: {},
      },
    ])("$name", ({ input, expected }) => {
      const actual = includeSchema.safeParse(input);

      expectToBeSafeParseSuccess(actual);
      expect(actual.data).toEqual(expected);
    });
  });

  describe("error cases", () => {
    it.each<{ name: string; input: unknown; expectedError: string }>([
      {
        name: "rejects invalid include fields",
        input: { include: "invalid" },
        expectedError: "Invalid include field: 'invalid'",
      },
      {
        name: "rejects invalid nested include fields",
        input: { include: "articles.invalid" },
        expectedError: "Invalid include field: 'articles.invalid'",
      },
      {
        name: "rejects on empty include parameter",
        input: { include: "" },
        expectedError: "Invalid include field: ''",
      },
      {
        name: "rejects non-string include parameter",
        input: { include: 123 },
        expectedError: "Expected array, received number",
      },
    ])("$name", ({ input, expectedError }) => {
      const actual = includeSchema.safeParse(input);

      expectToBeSafeParseError(actual);
      expect(actual.error.message).toContain(expectedError);
    });
  });
});
