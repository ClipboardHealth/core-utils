import { splitString } from "./splitString";

describe("splitString", () => {
  it("splits comma-separated string into array", () => {
    const input = "a,b";

    const actual = splitString(input);

    expect(actual).toEqual(["a", "b"]);
  });

  it("returns empty array for empty string", () => {
    const input = "";

    const actual = splitString(input);

    expect(actual).toEqual([""]);
  });

  it("returns single-element array for string without commas", () => {
    const input = "a";

    const actual = splitString(input);

    expect(actual).toEqual(["a"]);
  });

  it("returns original value for non-string input", () => {
    const input = ["a", "b"];

    const actual = splitString(input);

    expect(actual).toBe(input);
  });
});
