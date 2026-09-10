import { isRecord } from "./isRecord";

describe(isRecord, () => {
  it.each([
    { input: {}, expected: true },
    { input: { a: 1 }, expected: true },
    { input: Object.create(null) as unknown, expected: true },
    { input: [], expected: false },
    { input: [1, 2, 3], expected: false },
    { input: null, expected: false },
    { input: undefined, expected: false },
    { input: "", expected: false },
    { input: 0, expected: false },
    { input: false, expected: false },
  ])("returns $expected for $input", ({ input, expected }) => {
    const actual = isRecord(input);

    expect(actual).toBe(expected);
  });
});
