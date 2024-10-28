import { deepFreeze } from "./deepFreeze";

describe("deepFreeze", () => {
  it("freezes a simple object", () => {
    const input = { a: 1, b: 2 };

    const actual = deepFreeze(input);

    expect(Object.isFrozen(actual)).toBe(true);
    expect(actual).toEqual(input);
    expect(() => {
      // @ts-expect-error: Cannot assign to read only
      actual.a = 2;
    }).toThrow(TypeError);
  });

  it("freezes nested objects", () => {
    const input = {
      a: { b: 1 },
      c: { d: { e: 2 } },
      f: [{ g: 3 }],
    };

    const actual = deepFreeze(input);

    expect(Object.isFrozen(actual)).toBe(true);
    expect(Object.isFrozen(actual.a)).toBe(true);
    expect(Object.isFrozen(actual.c)).toBe(true);
    expect(Object.isFrozen(actual.c.d)).toBe(true);
    expect(Object.isFrozen(actual.f)).toBe(true);
    expect(Object.isFrozen(actual.f[0])).toBe(true);
    expect(actual).toEqual(input);
  });

  it("handles circular references", () => {
    const input: Record<string, unknown> = { a: 1 };
    input["self"] = input;

    const actual = deepFreeze(input);

    expect(Object.isFrozen(actual)).toBe(true);
    expect(actual).toEqual(input);
  });

  it("returns non-object values as-is", () => {
    // eslint-disable-next-line unicorn/no-null
    const inputs = [null, undefined, 42, "test", true, Symbol("test")] as const;

    inputs.forEach((input) => {
      const actual = deepFreeze(input as unknown as Record<string, unknown>);

      expect(actual).toBe(input);
    });
  });
});
