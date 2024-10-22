import { z } from "zod";

import { expectToBeSafeParseError } from "./expectToBeSafeParseError";

describe("expectToBeSafeParseError", () => {
  interface TestCase {
    name: string;
    input: z.SafeParseReturnType<unknown, unknown>;
  }

  const schema = z.string();

  it.each<TestCase>([
    {
      name: "passes for SafeParseError",
      input: schema.safeParse(123),
    },
  ])("$name", ({ input }) => {
    expect(() => {
      expectToBeSafeParseError(input);
    }).not.toThrow();
  });

  it.each<TestCase>([
    {
      name: "throws for SafeParseSuccess",
      input: schema.safeParse("valid string"),
    },
    {
      name: "throws for undefined",
      input: undefined as unknown as z.SafeParseReturnType<unknown, unknown>,
    },
  ])("$name", ({ input }) => {
    expect(() => {
      expectToBeSafeParseError(input);
    }).toThrow();
  });

  it("narrows type", () => {
    const result = schema.safeParse(123);

    expectToBeSafeParseError(result);

    // Narrowed to SafeParseError
    expect(result.success).toBe(false);
    expect(result.error).toBeDefined();
  });
});
