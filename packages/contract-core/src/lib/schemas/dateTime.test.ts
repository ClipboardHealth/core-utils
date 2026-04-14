import {
  expectToBeSafeParseError,
  expectToBeSafeParseSuccess,
} from "@clipboard-health/testing-core";

import { dateTimeSchema } from "./dateTime";

describe(dateTimeSchema, () => {
  const schema = dateTimeSchema();

  describe("success cases", () => {
    it.each<{ expected: string; input: unknown; name: string }>([
      {
        name: "accepts ISO-8601 datetime with milliseconds",
        input: "2026-03-15T10:30:00.000Z",
        expected: "2026-03-15T10:30:00.000Z",
      },
      {
        name: "accepts ISO-8601 datetime without milliseconds",
        input: "2026-03-15T10:30:00Z",
        expected: "2026-03-15T10:30:00.000Z",
      },
      {
        name: "accepts ISO-8601 datetime with positive offset",
        input: "2026-03-15T15:30:00.000+05:00",
        expected: "2026-03-15T10:30:00.000Z",
      },
      {
        name: "accepts ISO-8601 datetime with negative offset",
        input: "2026-03-15T06:30:00.000-04:00",
        expected: "2026-03-15T10:30:00.000Z",
      },
      {
        name: "accepts ISO-8601 datetime with zero offset",
        input: "2026-03-15T10:30:00.000+00:00",
        expected: "2026-03-15T10:30:00.000Z",
      },
      {
        name: "accepts Date object",
        input: new Date("2026-03-15T10:30:00.000Z"),
        expected: "2026-03-15T10:30:00.000Z",
      },
    ])("$name", ({ input, expected }) => {
      const actual = schema.safeParse(input);

      expectToBeSafeParseSuccess(actual);
      expect(actual.data).toBeInstanceOf(Date);
      expect(actual.data.toISOString()).toBe(expected);
    });
  });

  describe("error cases", () => {
    it.each<{ input: unknown; name: string }>([
      { name: "rejects date-only string", input: "2026-03-15" },
      { name: "rejects epoch number", input: 1_773_340_050_000 },
      { name: "rejects invalid string", input: "not-a-date" },
      { name: "rejects empty string", input: "" },
      { name: "rejects undefined", input: undefined },
      { name: "rejects null", input: null },
      { name: "rejects object", input: {} },
    ])("$name", ({ input }) => {
      const actual = schema.safeParse(input);

      expectToBeSafeParseError(actual);
    });
  });

  describe("composability", () => {
    it("composes with .optional()", () => {
      const optionalSchema = dateTimeSchema().optional();

      // eslint-disable-next-line unicorn/no-useless-undefined
      const undef = optionalSchema.safeParse(undefined);
      expectToBeSafeParseSuccess(undef);
      expect(undef.data).toBeUndefined();

      const valid = optionalSchema.safeParse("2026-03-15T10:30:00.000Z");
      expectToBeSafeParseSuccess(valid);
      expect(valid.data).toBeInstanceOf(Date);
    });
  });
});
