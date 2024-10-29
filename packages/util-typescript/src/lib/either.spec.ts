import { isLeft, isRight, type Left, left, type Right, right } from "./either";

describe("Either", () => {
  it("left works", () => {
    const error = new Error("boom");
    const either = left(error) as Left<Error>;

    expect(isLeft(either)).toBe(true);
    expect(isRight(either)).toBe(false);
    expect(either.isRight).toBe(false);
    expect(either.left).toBe(error);
  });

  it("right works", () => {
    const value = "my-value";
    const either = right(value) as Right<string>;

    expect(isRight(either)).toBe(true);
    expect(isLeft(either)).toBe(false);
    expect(either.isRight).toBe(true);
    expect(either.right).toBe(value);
  });
});
