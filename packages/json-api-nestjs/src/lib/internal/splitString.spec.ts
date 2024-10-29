import { splitString } from "./splitString";

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
    expect(splitString(input)).toEqual(expected);
  });
});
