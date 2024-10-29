import { type Either, left, right } from "@clipboard-health/util-typescript";

import { expectToBeLeft } from "./expectToBeLeft";

describe("expectToBeLeft", () => {
  interface TestCase {
    name: string;
    input: Either<string, number> | undefined;
  }

  it.each<TestCase>([
    {
      name: "passes for Left",
      input: left("error"),
    },
  ])("$name", ({ input }) => {
    expect(() => {
      expectToBeLeft(input);
    }).not.toThrow();
  });

  it.each<TestCase>([
    {
      name: "throws for Right",
      input: right(123),
    },
    {
      name: "throws for undefined",
      input: undefined,
    },
  ])("$name", ({ input }) => {
    expect(() => {
      expectToBeLeft(input);
    }).toThrow();
  });

  it("narrows type", () => {
    const actual = left("error");

    expectToBeLeft(actual);

    // Narrowed to Left
    expect(actual.left).toBe("error");
  });
});
