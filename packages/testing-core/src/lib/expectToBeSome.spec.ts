import { none, type Option, some } from "@clipboard-health/util-typescript";

import { expectToBeSome } from "./expectToBeSome";

describe("expectToBeSome", () => {
  interface TestCase {
    input: Option<number> | undefined;
    name: string;
  }

  it.each<TestCase>([
    {
      name: "passes for Some",
      input: some(123),
    },
  ])("$name", ({ input }) => {
    expect(() => {
      expectToBeSome(input);
    }).not.toThrow();
  });

  it.each<TestCase>([
    {
      name: "throws for None",
      input: none,
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
    const actual = some(123);

    expectToBeSome(actual);

    // Narrowed to Some
    expect(actual.value).toBe(123);
  });
});
