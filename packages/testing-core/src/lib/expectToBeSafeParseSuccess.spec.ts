import { z } from "zod";

import { expectToBeSafeParseSuccess } from "./expectToBeSafeParseSuccess";

describe("expectToBeSafeParseSuccess", () => {
  interface TestCase {
    expected?: string;
    input: z.SafeParseReturnType<unknown, unknown>;
    name: string;
  }

  const schema = z.string();

  it.each<TestCase>([
    {
      name: "passes for SafeParseSuccess",
      input: schema.safeParse("valid string"),
    },
  ])("$name", ({ input }) => {
    expect(() => {
      expectToBeSafeParseSuccess(input);
    }).not.toThrow();
  });

  it.each<TestCase>([
    {
      name: "throws for SafeParseError",
      input: schema.safeParse(123),
      expected: "Expected SafeParseSuccess, got SafeParseError",
    },
    {
      name: "throws for undefined",
      input: undefined as unknown as z.SafeParseReturnType<unknown, unknown>,
      expected: "Expected value to be defined",
    },
  ])("$name", ({ input, expected }) => {
    expect(() => {
      expectToBeSafeParseSuccess(input);
    }).toThrow(expected);
  });

  it("narrows type", () => {
    const input = "valid string";

    const actual = schema.safeParse(input);

    expectToBeSafeParseSuccess(actual);

    // Narrowed to SafeParseSuccess
    expect(actual.success).toBe(true);
    expect(actual.data).toBe(input);
    expectTypeOf(actual.data).toBeString();
  });
});
