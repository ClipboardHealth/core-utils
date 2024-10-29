import { toError } from "./toError";

describe("toError", () => {
  it.each([
    { input: new Error("test"), expected: "test" },
    { input: "test string", expected: "test string" },
    { input: { message: "test object" }, expected: "test object" },
    { input: 123, expected: "123" },
    { input: BigInt(123), expected: '"123"' },
    { input: Symbol("test"), expected: "Symbol(test)" },
    // eslint-disable-next-line unicorn/no-null
    { input: null, expected: "null" },
    { input: undefined, expected: "" },
    { input: "", expected: "" },
    { input: {}, expected: "{}" },
    { input: [], expected: "[]" },
    { input: [1, 2, 3], expected: "[1,2,3]" },
  ])("returns Error with message '$expected' for $input", ({ input, expected }) => {
    const actual = toError(input);

    expect(actual).toBeInstanceOf(Error);
    expect(actual.message).toBe(expected);
  });

  it("handles stringify errors by falling back to String()", () => {
    const input = {
      toJSON: () => {
        throw new Error("JSON error");
      },
    };

    const actual = toError(input);

    expect(actual).toBeInstanceOf(Error);
    expect(actual.message).toBe("[object Object]");
  });

  it("correctly identifies and preserves existing Error objects using isError", () => {
    const originalError = new Error("original");
    originalError.stack = "custom stack";

    const result = toError(originalError);

    expect(result).toBe(originalError);
    expect(result.stack).toBe("custom stack");
  });
});
