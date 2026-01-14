import { getOtaBuildIdAsNumber } from "./getOtaBuildIdAsNumber";

describe("getOtaBuildIdAsNumber", () => {
  it.each([
    { input: "123", expected: 123 },
    { input: "0", expected: 0 },
    { input: "1", expected: 1 },
    { input: "999999999", expected: 999_999_999 },
    { input: "42", expected: 42 },
  ])("returns $expected for valid numeric string '$input'", ({ input, expected }) => {
    const actual = getOtaBuildIdAsNumber(input);

    expect(actual).toBe(expected);
  });

  it.each([
    { input: "", description: "empty string" },
    { input: "abc", description: "alphabetic string" },
    { input: "12.3", description: "decimal number" },
    { input: "12a3", description: "mixed alphanumeric" },
    { input: "-123", description: "negative number" },
    { input: "+123", description: "positive sign prefix" },
    { input: " 123", description: "leading space" },
    { input: "123 ", description: "trailing space" },
    { input: "1e5", description: "scientific notation" },
    { input: "0x10", description: "hexadecimal" },
  ])("returns 0 for invalid input: $description", ({ input }) => {
    const actual = getOtaBuildIdAsNumber(input);

    expect(actual).toBe(0);
  });
});
