import { isError } from "./isError";

describe("isError", () => {
  it.each([
    { input: new Error("test"), expected: true },
    { input: new TypeError("test"), expected: true },
    { input: "error", expected: false },
    { input: { message: "error" }, expected: false },
    { input: 123, expected: false },
    { input: true, expected: false },
    { input: {}, expected: false },
    { input: [], expected: false },
    // eslint-disable-next-line unicorn/no-null
    { input: null, expected: false },
    { input: undefined, expected: false },
  ])("returns $expected for $input", ({ input, expected }) => {
    const actual = isError(input);

    expect(actual).toBe(expected);
  });
});
