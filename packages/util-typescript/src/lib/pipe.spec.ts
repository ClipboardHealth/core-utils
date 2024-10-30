import { pipe } from "./pipe";

describe("pipe", () => {
  it("pipes values through functions", () => {
    const result = pipe(
      5,
      (x) => x * 2,
      (x) => x + 1,
    );

    expect(result).toBe(11);
  });

  it("handles 10 arguments", () => {
    const result = pipe(
      1,
      (x) => x + 1, // 2
      (x) => x * 2, // 4
      (x) => x + 3, // 7
      (x) => x * 2, // 14
      (x) => x - 4, // 10
      (x) => x / 2, // 5
      (x) => x * 2, // 10
      (x) => x + 5, // 15
      (x) => x / 3,
    );

    expect(result).toBe(5);
  });
});
