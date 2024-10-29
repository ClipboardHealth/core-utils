import { type Either, left, right } from "@clipboard-health/util-typescript";

import { expectToBeRight } from "./expectToBeRight";

describe("expectToBeRight", () => {
  interface TestCase {
    input: Either<string, number> | undefined;
    name: string;
  }

  it.each<TestCase>([
    {
      name: "passes for Right",
      input: right(123),
    },
  ])("$name", ({ input }) => {
    expect(() => {
      expectToBeRight(input);
    }).not.toThrow();
  });

  it.each<TestCase>([
    {
      name: "throws for Left",
      input: left("error"),
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
    const actual = right(123);

    expectToBeRight(actual);

    // Narrowed to Right
    expect(actual.right).toBe(123);
  });
});
