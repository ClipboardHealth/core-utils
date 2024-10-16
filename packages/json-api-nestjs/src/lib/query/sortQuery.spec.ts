import { z } from "zod";

import { expectToBeError, expectToBeSuccess } from "../../test";
import { sortQuery } from "./sortQuery";

describe("sortQuery", () => {
  const sortSchema = z.object(sortQuery(["age", "dateOfBirth"] as const));

  it("accepts valid sort parameters", () => {
    const input = {
      sort: "age",
    };

    const actual = sortSchema.safeParse(input);

    expectToBeSuccess(actual);
    expect(actual.data).toEqual({
      sort: ["age"],
    });
  });

  it("rejects invalid sort fields", () => {
    const input = {
      sort: "-age,invalid",
    };

    const actual = sortSchema.safeParse(input);

    expectToBeError(actual);
    expect(actual.error.message).toContain("Invalid sort field: 'invalid'");
  });

  it("allows descending sort with '-' prefix", () => {
    const input = {
      sort: "-age,dateOfBirth",
    };

    const actual = sortSchema.safeParse(input);

    expectToBeSuccess(actual);
    expect(actual.data).toEqual({
      sort: ["-age", "dateOfBirth"],
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
