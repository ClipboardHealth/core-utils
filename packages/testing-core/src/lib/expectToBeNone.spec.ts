import { option as O } from "@clipboard-health/util-ts";

import { expectToBeNone } from "./expectToBeNone";

describe("expectToBeNone", () => {
  interface TestCase {
    input: O.Option<number> | undefined;
    name: string;
  }

  it.each<TestCase>([
    {
      name: "passes for None",
      input: O.none,
    },
  ])("$name", ({ input }) => {
    expect(() => {
      expectToBeNone(input);
    }).not.toThrow();
  });

  it.each<TestCase>([
    {
      name: "throws for Some",
      input: O.some(123),
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
    const actual = O.none;

    expectToBeNone(actual);

    // Narrowed to None
    expect(actual.isSome).toBe(false);
    expect(O.isNone(actual)).toBe(true);
  });
});
