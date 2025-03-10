import { expectToBeDefined } from "./expectToBeDefined";

describe("expectToBeDefined", () => {
  interface TestCase {
    input: unknown;
    name: string;
  }

  it.each<TestCase>([
    {
      name: "passes for defined non-null value",
      input: "hello",
    },
    {
      name: "passes for defined zero",
      input: 0,
    },
    {
      name: "passes for defined false",
      input: false,
    },
    {
      name: "passes for empty string",
      input: "",
    },
    {
      name: "passes for empty array",
      input: [],
    },
    {
      name: "passes for empty object",
      input: {},
    },
    {
      name: "passes for negative number",
      input: -1,
    },
  ])("$name", ({ input }) => {
    expect(() => {
      expectToBeDefined(input);
    }).not.toThrow();
  });

  it.each<TestCase>([
    {
      name: "throws for undefined",
      input: undefined,
    },
    {
      name: "throws for null",
      input: null,
    },
  ])("$name", ({ input }) => {
    expect(() => {
      expectToBeDefined(input);
    }).toThrow();
  });

  it("narrows type", () => {
    const value: string | undefined = "test";

    expectToBeDefined(value);

    // Narrowed to `string`
    const { length } = value;
    expect(length).toBe(4);
  });
});
