import * as E from "./either";
import { pipe } from "./pipe";

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

  describe("map", () => {
    it("maps Right value", () => {
      const actual = pipe(E.right(5), E.map(double));
      expect(actual).toEqual(E.right(10));
    });

    it("does not map Left", () => {
      const error = new Error("boom");
      const actual = pipe(E.left(error), E.map(double));
      expect(actual).toEqual(E.left(error));
    });
  });

  describe("mapLeft", () => {
    it("maps Left value", () => {
      const actual = pipe(E.left("boom"), E.mapLeft(addPrefix));
      expect(actual).toEqual(E.left("Error: boom"));
    });

    it("does not map Right", () => {
      const actual = pipe(E.right(5), E.mapLeft(addPrefix));
      expect(actual).toEqual(E.right(5));
    });
  });

  describe("flatMap", () => {
    it("flatMaps Right operations", () => {
      const actual = pipe(E.right(2), E.flatMap(inverse));
      expect(actual).toEqual(E.right(0.5));
    });

    it("does not flatMap Left", () => {
      const error = "Initial error";
      const actual = pipe(E.left(error), E.flatMap(inverse));
      expect(actual).toEqual(E.left(error));
    });
  });

  describe("getOrElse", () => {
    it("returns Right", () => {
      const actual = pipe(
        E.right(5),
        E.getOrElse(() => 1),
      );
      expect(actual).toBe(5);
    });

    it("returns default for Left", () => {
      const actual = pipe(
        E.left("error"),
        E.getOrElse(() => 1),
      );
      expect(actual).toBe(1);
    });
  });

  describe("match", () => {
    it("handles Right case", () => {
      const actual = pipe(E.right(5), E.match(onLeft, onRight));
      expect(actual).toBe("Got 5");
    });

    it("handles Left case", () => {
      const actual = pipe(E.left("boom"), E.match(onLeft, onRight));
      expect(actual).toBe("Error: boom");
    });
  });

  it("works with complex pipe operations", () => {
    const actual = pipe(
      E.right(5),
      E.map(double),
      E.flatMap(inverse),
      E.match(
        (error) => `Error: ${error}`,
        (result) => `Result is ${result}`,
      ),
    );

    expect(actual).toBe("Result is 0.1");
  });
});

function onRight(result: number) {
  return `Got ${result}`;
}

function onLeft(error: string) {
  return `Error: ${error}`;
}

function addPrefix(left: string) {
  return `Error: ${left}`;
}

function double(n: number): number {
  return n * 2;
}

function inverse(n: number): E.Either<string, number> {
  return n === 0 ? E.left("Division by zero") : E.right(1 / n);
}
