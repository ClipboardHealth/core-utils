import {
  expectToBeSafeParseError,
  expectToBeSafeParseSuccess,
} from "@clipboard-health/testing-core";
import { z } from "zod";

import { cursorPaginationQuery } from "./cursorPaginationQuery";

describe("cursorPaginationQuery", () => {
  interface Page {
    cursor?: string;
    size?: number;
  }

  const cursorPaginationSchema = z.object(cursorPaginationQuery());

  it.each<{ expected: { page?: Page }; input: { page?: Page }; name: string }>([
    {
      name: "parses size",
      input: { page: { size: 30 } },
      expected: { page: { size: 30 } },
    },
    {
      name: "parses cursor and defaults size",
      input: { page: { cursor: "abc" } },
      expected: { page: { size: 20, cursor: "abc" } },
    },
    {
      name: "parses size and cursor",
      input: { page: { size: 10, cursor: "abc" } },
      expected: { page: { size: 10, cursor: "abc" } },
    },
  ])("$name", ({ input, expected }) => {
    const actual = cursorPaginationSchema.safeParse(input);

    expectToBeSafeParseSuccess(actual);
    expect(actual.data).toEqual(expected);
  });

  it.each<{ errorMessage: string; input: unknown; name: string }>([
    {
      name: "rejects size under minimum",
      input: { page: { size: 0 } },
      errorMessage: "Number must be greater than 0",
    },
    {
      name: "rejects size over maximum",
      input: { page: { size: 201 } },
      errorMessage: "Number must be less than or equal to 200",
    },
    {
      name: "rejects non-string cursor",
      input: { page: { cursor: 123 } },
      errorMessage: "Expected string, received number",
    },
    {
      name: "rejects empty cursor",
      input: { page: { cursor: "" } },
      errorMessage: "String must contain at least 1 character(s)",
    },
  ])("$name", ({ input, errorMessage }) => {
    const actual = cursorPaginationSchema.safeParse(input);

    expectToBeSafeParseError(actual);
    expect(actual.error.message).toContain(errorMessage);
  });

  describe("with custom defaults", () => {
    const schema = z.object(cursorPaginationQuery({ size: { default: 10, maximum: 100 } }));

    it("defaults custom size", () => {
      const input = {};

      const actual = schema.safeParse(input);

      expectToBeSafeParseSuccess(actual);
      expect(actual.data).toEqual({
        page: {
          size: 10,
        },
      });
    });

    it("rejects custom size over maximum", () => {
      const input = {
        page: {
          size: 101,
        },
      };

      const actual = schema.safeParse(input);

      expectToBeSafeParseError(actual);
      expect(actual.error.message).toContain("Number must be less than or equal to 100");
    });
  });
});
