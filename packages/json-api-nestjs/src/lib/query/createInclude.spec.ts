import { z } from "zod";

import { expectToBeError, expectToBeSuccess } from "../../test";
import { createInclude } from "./createInclude";

describe("createInclude", () => {
  const includeSchema = z.object(createInclude(["articles", "articles.comments"]));

  it("accepts valid include parameters", () => {
    const input = {
      include: "articles",
    };

    const actual = includeSchema.safeParse(input);

    expectToBeSuccess(actual);
    expect(actual.data).toEqual({
      include: ["articles"],
    });
  });

  it("accepts nested include parameters", () => {
    const input = {
      include: "articles.comments",
    };

    const actual = includeSchema.safeParse(input);

    expectToBeSuccess(actual);
    expect(actual.data).toEqual({
      include: ["articles.comments"],
    });
  });

  it("rejects invalid include fields", () => {
    const input = {
      include: "invalid",
    };

    const actual = includeSchema.safeParse(input);

    expectToBeError(actual);
    expect(actual.error.message).toContain("Invalid include field: 'invalid'");
  });

  it("rejects invalid nested include fields", () => {
    const input = {
      include: "articles.invalid",
    };

    const actual = includeSchema.safeParse(input);

    expectToBeError(actual);
    expect(actual.error.message).toContain("Invalid include field: 'articles.invalid'");
  });

  it("allows omitting include parameter", () => {
    const input = {};

    const actual = includeSchema.safeParse(input);

    expectToBeSuccess(actual);
    expect(actual.data).toEqual({});
  });

  it("rejects on empty include parameter", () => {
    const input = {
      include: "",
    };

    const actual = includeSchema.safeParse(input);

    expectToBeError(actual);
    expect(actual.error.message).toContain("Invalid include field: ''");
  });

  it("rejects non-string include parameter", () => {
    const input = {
      include: 123,
    };

    const actual = includeSchema.safeParse(input);

    expectToBeError(actual);
    expect(actual.error.message).toContain("Expected array, received number");
  });
});
