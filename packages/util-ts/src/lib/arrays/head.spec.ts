/* eslint-disable sonarjs/deprecation */
import { head } from "./head";

describe("head", () => {
  it("returns head of list", () => {
    expect(head([1, 2])).toBe(1);
  });

  it("returns undefined if empty list", () => {
    // eslint-disable-next-line @typescript-eslint/no-confusing-void-expression
    expect(head([])).toBeUndefined();
  });

  it("returns undefined if passed", () => {
    expect(head()).toBeUndefined();
  });

  it("returns value if not an array", () => {
    const value = { hi: "there" };
    expect(head(value)).toEqual(value);
  });
});
/* eslint-enable sonarjs/deprecation */
