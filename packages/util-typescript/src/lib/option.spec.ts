import * as O from "./option";
import { pipe } from "./pipe";

describe("Option", () => {
  it("none is not some", () => {
    const option = O.none;

    expect(O.isNone(option)).toBe(true);
    expect(O.isSome(option)).toBe(false);
    expect(option.isSome).toBe(false);
  });

  it("some is some", () => {
    const value = "my-value";
    const option = O.some(value);

    expect(O.isNone(option)).toBe(false);
    expect(O.isSome(option)).toBe(true);
    expect(option.isSome).toBe(true);
    expect(option.value).toBe(value);
  });

  describe("map", () => {
    it("should transform Some value", () => {
      const actual = pipe(O.some(5), O.map(double));
      expect(actual).toEqual(O.some(10));
    });

    it("should handle None", () => {
      const actual = pipe(O.none, O.map(double));
      expect(actual).toBe(O.none);
    });
  });

  describe("flatMap", () => {
    it("should flatMap Some operations", () => {
      const actual = pipe(O.some(2), O.flatMap(inverse));
      expect(actual).toEqual(O.some(0.5));
    });

    it("should handle None", () => {
      const actual = pipe(O.none, O.flatMap(inverse));
      expect(actual).toBe(O.none);
    });
  });

  describe("getOrElse", () => {
    it("should return value for Some", () => {
      const actual = pipe(O.some(5), O.getOrElse(1));
      expect(actual).toBe(5);
    });

    it("should return default for None", () => {
      const actual = pipe(O.none, O.getOrElse(1));
      expect(actual).toBe(1);
    });
  });

  describe("match", () => {
    it("should handle Some case", () => {
      const actual = pipe(O.some(5), O.match(onSome, onNone));
      expect(actual).toBe("Got 5");
    });

    it("should handle None case", () => {
      const actual = pipe(O.none, O.match(onSome, onNone));
      expect(actual).toBe("Nothing");
    });
  });

  it("should work with complex pipe operations", () => {
    const actual = pipe(
      O.some(5),
      O.map(double),
      O.flatMap(inverse),
      O.match(
        (n) => `Result is ${n}`,
        () => "no result",
      ),
    );

    expect(actual).toBe("Result is 0.1");
  });
});

function onSome(x: number) {
  return `Got ${x}`;
}

function onNone() {
  return "Nothing";
}

function double(n: number) {
  return n * 2;
}

function inverse(n: number): O.Option<number> {
  return n === 0 ? O.none : O.some(1 / n);
}
