import { z } from "zod";

import { expectToBeSafeParseSuccess } from "./expectToBeSafeParseSuccess";

describe("expectToBeSafeParseSuccess", () => {
  interface TestCase {
    name: string;
    input: z.SafeParseReturnType<unknown, unknown>;
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
    },
    {
      name: "throws for undefined",
      input: undefined as unknown as z.SafeParseReturnType<unknown, unknown>,
    },
  ])("$name", ({ input }) => {
    expect(() => {
      expectToBeSafeParseSuccess(input);
    }).toThrow();
  });

  it("narrows type", () => {
    const result = schema.safeParse("valid string");

    expectToBeSafeParseSuccess(result);

    // Narrowed to SafeParseSuccess
    expect(result.success).toBe(true);
    expect(result.data).toBeDefined();
  });
});
