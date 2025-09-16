import { chunk } from "./chunk";

describe("chunk", () => {
  it("splits array into equal chunks", () => {
    const input = [1, 2, 3, 4, 5, 6];
    const expected = [
      [1, 2],
      [3, 4],
      [5, 6],
    ];

    const actual = chunk(input, 2);

    expect(actual).toEqual(expected);
  });

  it("handles array that doesn't divide evenly", () => {
    const input = [1, 2, 3, 4, 5];
    const expected = [[1, 2], [3, 4], [5]];

    const actual = chunk(input, 2);

    expect(actual).toEqual(expected);
  });

  it("handles empty array", () => {
    const input: number[] = [];
    const expected: number[][] = [];

    const actual = chunk(input, 2);

    expect(actual).toEqual(expected);
  });

  it("handles chunk size larger than array length", () => {
    const input = [1, 2, 3];
    const expected = [[1, 2, 3]];

    const actual = chunk(input, 5);

    expect(actual).toEqual(expected);
  });

  it("handles chunk size equal to array length", () => {
    const input = [1, 2, 3];
    const expected = [[1, 2, 3]];

    const actual = chunk(input, 3);

    expect(actual).toEqual(expected);
  });

  it("works with different data types", () => {
    const input = ["a", "b", "c", "d"];
    const expected = [
      ["a", "b"],
      ["c", "d"],
    ];

    const actual = chunk(input, 2);

    expect(actual).toEqual(expected);
  });
});
