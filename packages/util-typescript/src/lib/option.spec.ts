import * as O from "./option";

const { none, some } = O;

describe("Option", () => {
  it("none is not some", () => {
    const option = none;

    expect(O.isNone(option)).toBe(true);
    expect(O.isSome(option)).toBe(false);
    expect(option.isSome).toBe(false);
  });

  it("some is some", () => {
    const value = "my-value";

    const option = some(value);

    expect(O.isNone(option)).toBe(false);
    expect(O.isSome(option)).toBe(true);
    expect(option.isSome).toBe(true);
    expect(option.value).toBe(value);
  });
});
