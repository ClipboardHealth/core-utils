import { splitString, wrapString } from "./splitString";

describe("splitString", () => {
  it.each<{ expected: unknown; input: unknown; name: string }>([
    {
      name: "handles empty string",
      input: "",
      expected: [""],
    },
    {
      name: "handles string without commas",
      input: "a",
      expected: ["a"],
    },
    {
      name: "handles comma-separated string",
      input: "a,b",
      expected: ["a", "b"],
    },
    {
      name: "returns original value for array input",
      input: ["a", "b"],
      expected: ["a", "b"],
    },
    {
      name: "returns original value for number input",
      input: 1,
      expected: 1,
    },
  ])("$name", ({ input, expected }) => {
    expect(splitString(input)).toStrictEqual(expected);
  });
});

describe("wrapString", () => {
  it.each<{ expected: unknown; input: unknown; name: string }>([
    {
      name: "wraps string in array",
      input: "a",
      expected: ["a"],
    },
    {
      name: "preserves commas in string",
      input: "a,b",
      expected: ["a,b"],
    },
    {
      name: "returns original value for array input",
      input: ["a", "b"],
      expected: ["a", "b"],
    },
  ])("$name", ({ input, expected }) => {
    expect(wrapString(input)).toStrictEqual(expected);
  });
});
