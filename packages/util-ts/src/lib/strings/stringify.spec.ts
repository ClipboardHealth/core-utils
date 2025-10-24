import { stringify } from "./stringify";

describe("stringify", () => {
  it.each([
    { input: "hello", expected: '"hello"' },
    { input: 123, expected: "123" },
    { input: true, expected: "true" },
    { input: { foo: "bar" }, expected: '{"foo":"bar"}' },
    { input: [1, 2, 3], expected: "[1,2,3]" },
    { input: BigInt(9_007_199_254_740_991), expected: '"9007199254740991"' },
    { input: null, expected: "null" },
    { input: undefined, expected: undefined },
    { input: { nested: { array: [1, { x: 2 }] } }, expected: '{"nested":{"array":[1,{"x":2}]}}' },
    { input: "Hello\nWorld", expected: String.raw`"Hello\nWorld"` },
    { input: "🚀", expected: '"🚀"' },
    { input: Number.MAX_SAFE_INTEGER, expected: "9007199254740991" },
  ])("returns $expected for $input", ({ input, expected }) => {
    const actual = stringify(input);

    expect(actual).toBe(expected);
  });

  it("throws on circular references", () => {
    const circular = { self: {} };
    circular.self = circular;
    expect(() => stringify(circular)).toThrow();
  });
});
