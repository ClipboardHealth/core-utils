import { expectToBeDefined } from "./expectToBeDefined";

describe("expectToBeDefined", () => {
  interface TestCase {
    name: string;
    input: unknown;
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
      // eslint-disable-next-line unicorn/no-null
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
