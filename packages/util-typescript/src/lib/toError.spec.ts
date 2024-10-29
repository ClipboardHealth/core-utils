import { toError } from "./toError";

describe("toError", () => {
  it.each([
    { input: new Error("test"), expected: "test" },
    { input: "test string", expected: "test string" },
    { input: { message: "test object" }, expected: '{"message":"test object"}' },
    { input: 123, expected: "123" },
    { input: BigInt(123), expected: '"123"' },
    { input: Symbol("test"), expected: "Symbol(test)" },
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
});
