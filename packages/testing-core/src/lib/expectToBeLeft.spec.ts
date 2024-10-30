import { either as E } from "@clipboard-health/util-typescript";

import { expectToBeLeft } from "./expectToBeLeft";

describe("expectToBeLeft", () => {
  interface TestCase {
    input: E.Either<string, number> | undefined;
    name: string;
  }

  it.each<TestCase>([
    {
      name: "passes for Left",
      input: E.left("error"),
    },
  ])("$name", ({ input }) => {
    expect(() => {
      expectToBeLeft(input);
    }).not.toThrow();
  });

  it.each<TestCase>([
    {
      name: "throws for Right",
      input: E.right(123),
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
    const actual = E.left("error");

    expectToBeLeft(actual);

    // Narrowed to Left
    expect(actual.left).toBe("error");
  });
});
