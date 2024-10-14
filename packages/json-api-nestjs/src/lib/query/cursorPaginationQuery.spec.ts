import { z } from "zod";

import { expectToBeError, expectToBeSuccess } from "../../test";
import { cursorPaginationQuery } from "./cursorPaginationQuery";

const cursorPaginationSchema = z.object(cursorPaginationQuery());

describe("cursorPaginationQuery", () => {
  it("parses size", () => {
    const input = {
      page: {
        size: 30,
      },
    };

    const actual = cursorPaginationSchema.safeParse(input);

    expectToBeSuccess(actual);
    expect(actual.data).toEqual(input);
  });

  it("parses cursor and defaults size", () => {
    const input = {
      page: {
        cursor: "abc",
      },
    };

    const actual = cursorPaginationSchema.safeParse(input);

    expectToBeSuccess(actual);
    expect(actual.data).toEqual({ page: { size: 20, ...input.page } });
  });

  it("parses size and cursor", () => {
    const input = {
      page: {
        size: 10,
        cursor: "abc",
      },
    };

    const actual = cursorPaginationSchema.safeParse(input);

    expectToBeSuccess(actual);
    expect(actual.data).toEqual(input);
  });

  it("rejects size under minimum", () => {
    const input = {
      page: {
        size: 0,
      },
    };

    const actual = cursorPaginationSchema.safeParse(input);

    expectToBeError(actual);
    expect(actual.error.message).toContain("Number must be greater than 0");
  });

  it("rejects size over maximum", () => {
    const input = {
      page: {
        size: 201,
      },
    };

    const actual = cursorPaginationSchema.safeParse(input);

    expectToBeError(actual);
    expect(actual.error.message).toContain("Number must be less than or equal to 200");
  });

  it("rejects non-string cursor", () => {
    const input = {
      page: {
        cursor: 123,
      },
    };

    const actual = cursorPaginationSchema.safeParse(input);

    expectToBeError(actual);
    expect(actual.error.message).toContain("Expected string, received number");
  });

  it("rejects empty cursor", () => {
    const input = {
      page: {
        cursor: "",
      },
    };

    const actual = cursorPaginationSchema.safeParse(input);

    expectToBeError(actual);
    expect(actual.error.message).toContain("String must contain at least 1 character(s)");
  });

  describe("with custom defaults", () => {
    const schema = z.object(cursorPaginationQuery({ defaultSize: 10, maximumSize: 100 }));

    it("defaults custom size", () => {
      const input = {};

      const actual = schema.safeParse(input);

      expectToBeSuccess(actual);
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

      expectToBeError(actual);
      expect(actual.error.message).toContain("Number must be less than or equal to 100");
    });
  });
});
