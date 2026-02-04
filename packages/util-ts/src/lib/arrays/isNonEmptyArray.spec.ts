import { isNonEmptyArray } from "./isNonEmptyArray";

describe("isNonEmptyArray", () => {
  it("returns true for array with one element", () => {
    expect(isNonEmptyArray([1])).toBe(true);
  });

  it("returns true for array with multiple elements", () => {
    expect(isNonEmptyArray([1, 2, 3])).toBe(true);
  });

  it("returns false for empty array", () => {
    expect(isNonEmptyArray([])).toBe(false);
  });

  it("narrows type to allow accessing first element", () => {
    const input: number[] = [1, 2, 3];

    expect(isNonEmptyArray(input)).toBe(true);
  });

  it("works with different element types", () => {
    expect(isNonEmptyArray(["a", "b"])).toBe(true);
    expect(isNonEmptyArray([{ id: 1 }])).toBe(true);
    expect(isNonEmptyArray([undefined])).toBe(true);
  });
});
