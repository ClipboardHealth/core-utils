import { isNil } from "./isNil";

describe("isNil", () => {
  it.each([
    // eslint-disable-next-line unicorn/no-null
    { input: null, expected: true },
    { input: undefined, expected: true },
    { input: "", expected: false },
    { input: 0, expected: false },
    { input: false, expected: false },
    { input: {}, expected: false },
    { input: [], expected: false },
  ])("returns $expected for $input", ({ input, expected }) => {
    const actual = isNil(input);

    expect(actual).toBe(expected);
  });
});
