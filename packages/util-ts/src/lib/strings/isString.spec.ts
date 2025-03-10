import { isString } from "./isString";

describe("isString", () => {
  it.each([
    { input: "hello", expected: true },
    { input: String("hello"), expected: true },
    // eslint-disable-next-line no-new-wrappers, unicorn/new-for-builtins
    { input: new String("hello"), expected: true },
    { input: "", expected: true },
    { input: "   ", expected: true },
    { input: `template`, expected: true },
    { input: "🚀\n\t", expected: true },
    { input: 123, expected: false },
    { input: true, expected: false },
    { input: {}, expected: false },
    { input: [], expected: false },
    { input: null, expected: false },
    { input: undefined, expected: false },
  ])("returns $expected for $input", ({ input, expected }) => {
    const actual = isString(input);

    expect(actual).toBe(expected);
  });
});
