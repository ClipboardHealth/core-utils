import * as O from "./option";
import { some } from "./option";

describe("Option", () => {
  it("none is not some", () => {
    const option = O.none;

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
