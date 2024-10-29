import { stringify } from "./stringify";

describe("stringify", () => {
  it.each([
    { input: "hello", expected: '"hello"' },
    { input: 123, expected: "123" },
    { input: true, expected: "true" },
    { input: { foo: "bar" }, expected: '{"foo":"bar"}' },
    { input: [1, 2, 3], expected: "[1,2,3]" },
    { input: BigInt(9_007_199_254_740_991), expected: '"9007199254740991"' },
    // eslint-disable-next-line unicorn/no-null
    { input: null, expected: "null" },
    { input: undefined, expected: undefined },
  ])("returns $expected for $input", ({ input, expected }) => {
    const actual = stringify(input);

    expect(actual).toBe(expected);
  });
});
