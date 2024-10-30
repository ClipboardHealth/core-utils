import { option as O } from "@clipboard-health/util-typescript";

import { expectToBeSome } from "./expectToBeSome";

describe("expectToBeSome", () => {
  interface TestCase {
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
    },
    {
      name: "throws for undefined",
      input: undefined,
    },
  ])("$name", ({ input }) => {
    expect(() => {
      expectToBeSome(input);
    }).toThrow();
  });

  it("narrows type", () => {
    const actual = O.some(123);

    expectToBeSome(actual);

    // Narrowed to Some
    expect(actual.value).toBe(123);
  });
});
