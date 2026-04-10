import { option as O } from "@clipboard-health/util-ts";

import { expectToBeSome } from "./expectToBeSome";

describe("expectToBeSome", () => {
  interface TestCase {
    expected?: string | RegExp;
    input: O.Option<number> | undefined;
    name: string;
  }

  it.each<TestCase>([
    {
      name: "passes for Some",
      input: O.some(123),
    },
  ])("$name", ({ input }) => {
    expect(() => {
      expectToBeSome(input);
    }).not.toThrow();
  });

  it.each<TestCase>([
    {
      name: "throws for None",
      input: O.none,
      expected: /falsy value/,
    },
    {
      name: "throws for undefined",
      input: undefined,
      expected: "Expected value to be defined",
    },
  ])("$name", ({ input, expected }) => {
    expect(() => {
      expectToBeSome(input);
    }).toThrow(expected);
  });

  it("narrows type", () => {
    const actual = O.some(123);

    expectToBeSome(actual);

    // Narrowed to Some
    expect(actual.value).toBe(123);
  });
});
