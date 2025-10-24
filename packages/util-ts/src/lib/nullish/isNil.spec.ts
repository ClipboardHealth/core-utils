// eslint-disable-next-line sonarjs/deprecation
import { isNil, isNullOrUndefined } from "./isNil";

describe("isNil", () => {
  it.each([
    { input: null, expected: true },
    { input: undefined, expected: true },
    { input: "", expected: false },
    { input: 0, expected: false },
    { input: false, expected: false },
    { input: {}, expected: false },
    { input: [], expected: false },
    { input: Number.NaN, expected: false },
    { input: Number.POSITIVE_INFINITY, expected: false },
    { input: Number.NEGATIVE_INFINITY, expected: false },
    { input: Symbol("test"), expected: false },
    { input: new Date(), expected: false },
  ])("returns $expected for $input", ({ input, expected }) => {
    const actual = isNil(input);
    expect(actual).toBe(expected);

    // eslint-disable-next-line sonarjs/deprecation
    const isNullOrUndefinedActual = isNullOrUndefined(input);
    expect(isNullOrUndefinedActual).toBe(expected);
  });
});
