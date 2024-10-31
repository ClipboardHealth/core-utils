import { either as E } from "@clipboard-health/util-ts";

import { expectToBeRight } from "./expectToBeRight";

describe("expectToBeRight", () => {
  interface TestCase {
    input: E.Either<string, number> | undefined;
    name: string;
  }

  it.each<TestCase>([
    {
      name: "passes for Right",
      input: E.right(123),
    },
  ])("$name", ({ input }) => {
    expect(() => {
      expectToBeRight(input);
    }).not.toThrow();
  });

  it.each<TestCase>([
    {
      name: "throws for Left",
      input: E.left("error"),
    },
    {
      name: "throws for undefined",
      input: undefined,
    },
  ])("$name", ({ input }) => {
    expect(() => {
      expectToBeRight(input);
    }).toThrow();
  });

  it("narrows type", () => {
    const actual = E.right(123);

    expectToBeRight(actual);

    // Narrowed to Right
    expect(actual.right).toBe(123);
  });
});
