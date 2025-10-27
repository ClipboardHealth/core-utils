import { forceCast } from "./forceCast";

describe("forceCast", () => {
  it("doesn't actually change type", () => {
    const a: number = forceCast<number>("a");
    expect(typeof a).toBe("string");
  });
});
