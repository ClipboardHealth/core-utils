import { isEmpty } from "./isEmpty";

describe("isEmpty", () => {
  it.each([
    [[], true],
    [[1], false],
    [[1, 2, 3], false],
    [{}, true],
    [{ a: 1 }, false],
    ["", true],
    ["hello", false],
    [null, true],
    [undefined, true],
    [0, true],
    [1, true],
    [false, true],
    [true, true],
  ])("returns %s for %s", (input, expected) => {
    const actual = isEmpty(input);

    expect(actual).toBe(expected);
  });

  it("returns true for an object with only inherited properties", () => {
    // oxlint-disable-next-line typescript/no-unsafe-assignment
    const input = Object.create({ inherited: true });

    const actual = isEmpty(input);

    expect(actual).toBeTruthy();
  });
});
