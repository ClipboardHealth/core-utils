import { isDefined } from "./isDefined";

describe("isDefined", () => {
  it.each([
    // eslint-disable-next-line unicorn/no-null
    { input: null, expected: false },
    { input: undefined, expected: false },
    { input: "", expected: true },
    { input: 0, expected: true },
    { input: false, expected: true },
    { input: {}, expected: true },
    { input: [], expected: true },
  ])("returns $expected for $input", ({ input, expected }) => {
    const actual = isDefined(input);

    expect(actual).toBe(expected);
  });
});
