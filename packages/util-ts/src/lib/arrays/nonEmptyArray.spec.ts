import { type NonEmptyArray, type OneOrNonEmptyArray, toNonEmptyArray } from "./nonEmptyArray";

describe("[deprecated] NonEmptyArray", () => {
  it("should allow creation of a non-empty array", () => {
    const array: NonEmptyArray<number> = [1, 2, 3];
    expect(array).toStrictEqual([1, 2, 3]);
  });
});

describe("[deprecated] OneOrNonEmptyArray", () => {
  it("should allow a single value", () => {
    const value: OneOrNonEmptyArray<string> = "test";
    expect(value).toBe("test");
  });

  it("should allow a non-empty array", () => {
    const array: OneOrNonEmptyArray<number> = [1, 2, 3];
    expect(array).toStrictEqual([1, 2, 3]);
  });
});

describe("[deprecated] toNonEmptyArray", () => {
  it("should convert a single value to a non-empty array", () => {
    const result = toNonEmptyArray(5);
    expect(result).toStrictEqual([5]);
  });

  it("should return the same array if given a non-empty array", () => {
    const input: NonEmptyArray<string> = ["a", "b", "c"];

    const result = toNonEmptyArray(input);

    expect(result).toBe(input);
    expect(result).toStrictEqual(["a", "b", "c"]);
  });
});
