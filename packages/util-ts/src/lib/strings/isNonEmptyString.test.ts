import { isNonEmptyString } from "./isNonEmptyString";

describe(isNonEmptyString, () => {
  it.each([
    { input: "hello", expected: true },
    { input: "   ", expected: true },
    { input: `template`, expected: true },
    { input: "🚀\n\t", expected: true },
    { input: "", expected: false },
    // eslint-disable-next-line no-new-wrappers, unicorn/new-for-builtins
    { input: new String("hello"), expected: false },
    { input: 123, expected: false },
    { input: true, expected: false },
    { input: {}, expected: false },
    { input: [], expected: false },
    { input: null, expected: false },
    { input: undefined, expected: false },
  ])("returns $expected for $input", ({ input, expected }) => {
    const actual = isNonEmptyString(input);

    expect(actual).toBe(expected);
  });
});
