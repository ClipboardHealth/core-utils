import { isNone, none, type Option, some } from "@clipboard-health/util-typescript";

import { expectToBeNone } from "./expectToBeNone";

describe("expectToBeNone", () => {
  interface TestCase {
    name: string;
    input: Option<number> | undefined;
  }

  it.each<TestCase>([
    {
      name: "passes for None",
      input: none,
    },
  ])("$name", ({ input }) => {
    expect(() => {
      expectToBeNone(input);
    }).not.toThrow();
  });

  it.each<TestCase>([
    {
      name: "throws for Some",
      input: some(123),
    },
    {
      name: "throws for undefined",
      input: undefined,
    },
  ])("$name", ({ input }) => {
    expect(() => {
      expectToBeNone(input);
    }).toThrow();
  });

  it("narrows type", () => {
    const actual = none;

    expectToBeNone(actual);

    // Narrowed to None
    expect(actual.isSome).toBe(false);
    expect(isNone(actual)).toBe(true);
  });
});
