import * as E from "./either";

describe("Either", () => {
  it("left works", () => {
    const error = new Error("boom");
    const either = E.left(error) as E.Left<Error>;

    expect(E.isLeft(either)).toBe(true);
    expect(E.isRight(either)).toBe(false);
    expect(either.isRight).toBe(false);
    expect(either.left).toBe(error);
  });

  it("right works", () => {
    const value = "my-value";
    const either = E.right(value) as E.Right<string>;

    expect(E.isRight(either)).toBe(true);
    expect(E.isLeft(either)).toBe(false);
    expect(either.isRight).toBe(true);
    expect(either.right).toBe(value);
  });
});
