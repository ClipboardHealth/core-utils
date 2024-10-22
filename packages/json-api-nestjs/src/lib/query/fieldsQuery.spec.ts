import {
  expectToBeSafeParseError,
  expectToBeSafeParseSuccess,
} from "@clipboard-health/testing-core";
import { type Arrayable } from "type-fest";
import { z } from "zod";

import { fieldsQuery } from "./fieldsQuery";

type Fields = Record<string, Arrayable<string>>;

describe("fieldsQuery", () => {
  const fieldsSchema = z.object(
    fieldsQuery({
      user: ["age", "dateOfBirth"],
      article: ["title"],
    }),
  );

  describe("success cases", () => {
    it.each<{ name: string; input: { fields?: Fields }; expected: { fields?: Fields } }>([
      {
        name: "accepts valid fields",
        input: {
          fields: {
            user: ["age", "dateOfBirth"],
            article: ["title"],
          },
        },
        expected: {
          fields: {
            user: ["age", "dateOfBirth"],
            article: ["title"],
          },
        },
      },
      {
        name: "allows omitting fields and API types",
        input: {
          fields: {
            user: ["age"],
          },
        },
        expected: {
          fields: {
            user: ["age"],
          },
        },
      },
      {
        name: "parses comma-separated string input",
        input: {
          fields: {
            user: "age,dateOfBirth",
            article: "title",
          },
        },
        expected: {
          fields: {
            user: ["age", "dateOfBirth"],
            article: ["title"],
          },
        },
      },
      {
        name: "allows empty object",
        input: {},
        expected: {},
      },
    ])("$name", ({ input, expected }) => {
      const actual = fieldsSchema.safeParse(input);

      expectToBeSafeParseSuccess(actual);
      expect(actual.data).toEqual(expected);
    });
  });

  describe("error cases", () => {
    it.each<{ name: string; input: unknown; expectedError: string }>([
      {
        name: "rejects invalid fields",
        input: {
          fields: {
            user: ["age", "invalid"],
            article: ["title"],
          },
        },
        expectedError: "Invalid enum value. Expected 'age' | 'dateOfBirth', received 'invalid'",
      },
      {
        name: "rejects unknown API type",
        input: {
          fields: {
            invalid: ["field"],
          },
        },
        expectedError: "Unrecognized key(s) in object: 'invalid'",
      },
      {
        name: "rejects empty array for fields",
        input: {
          fields: {
            user: [],
          },
        },
        expectedError: "Array must contain at least 1 element(s)",
      },
    ])("$name", ({ input, expectedError }) => {
      const actual = fieldsSchema.safeParse(input);

      expectToBeSafeParseError(actual);
      expect(actual.error.message).toContain(expectedError);
    });
  });
});
