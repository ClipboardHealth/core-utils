import { z } from "zod";

import { expectToBeError, expectToBeSuccess } from "../../test";
import { createSort } from "./createSort";

describe("createSort", () => {
  const sortSchema = z.object(
    createSort(["name", "age", "createdAt", "title", "publishedAt"] as const),
  );

  it("accepts valid sort parameters", () => {
    const input = {
      sort: "name,-age,createdAt",
    };

    const actual = sortSchema.safeParse(input);

    expectToBeSuccess(actual);
    expect(actual.data).toEqual({
      sort: ["name", "-age", "createdAt"],
    });
  });

  it("rejects invalid sort fields", () => {
    const input = {
      sort: "name,invalid",
    };

    const actual = sortSchema.safeParse(input);

    expectToBeError(actual);
    expect(actual.error.message).toContain("Invalid sort field: 'invalid'");
  });

  it("allows descending sort with '-' prefix", () => {
    const input = {
      sort: "-createdAt,title",
    };

    const actual = sortSchema.safeParse(input);

    expectToBeSuccess(actual);
    expect(actual.data).toEqual({
      sort: ["-createdAt", "title"],
    });
  });

  it("allows omitting sort parameter", () => {
    const input = {};

    const actual = sortSchema.safeParse(input);

    expectToBeSuccess(actual);
    expect(actual.data).toEqual({});
  });

  it("rejects on empty sort parameter", () => {
    const input = {
      sort: "",
    };

    const actual = sortSchema.safeParse(input);

    expectToBeError(actual);
    expect(actual.error.message).toContain("Invalid sort field: ''");
  });

  it("rejects non-string sort parameter", () => {
    const input = {
      sort: 123,
    };

    const actual = sortSchema.safeParse(input);

    expectToBeError(actual);
    expect(actual.error.message).toContain("Expected array, received number");
  });
});
