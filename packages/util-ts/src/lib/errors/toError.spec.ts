import { toError } from "./toError";

describe("toError", () => {
  it.each([
    { input: new Error("test"), expected: "test" },
    { input: "test string", expected: "test string" },
    { input: { message: "test object" }, expected: "test object" },
    { input: 123, expected: "123" },
    { input: BigInt(123), expected: '"123"' },
    { input: Symbol("test"), expected: "Symbol(test)" },
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

  it("preserves stack trace for error-like objects", () => {
    const errorLike = {
      message: "custom error",
      stack: "custom stack trace",
    };

    const actual = toError(errorLike);

    expect(actual).toBeInstanceOf(Error);
    expect(actual.message).toBe("custom error");
    expect(actual.stack).toBe("custom stack trace");
  });
});
