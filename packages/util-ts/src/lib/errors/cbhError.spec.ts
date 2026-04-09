import { ok } from "node:assert/strict";

import * as E from "../functional/either";
import { CbhError, toLeft } from "./cbhError";

describe("CbhError", () => {
  it("returns proper defaults", () => {
    const message = "boom";
    const statusCode = 500;

    const error = new CbhError({ message, statusCode });

    expect(error.name).toBe("CbhError");
    expect(error.message).toBe(message);
    expect(error.issues[0]?.statusCode).toBe(statusCode);
  });

  it("sets the cause", () => {
    const cause = new Error("cause");

    const error = new CbhError({ message: "boom", cause });

    expect(error.cause).toBe(cause);
  });

  it("accepts an array", () => {
    const message = "boom";

    const error = new CbhError([{ message }]);

    expect(error.message).toBe(message);
  });

  it("accepts a string", () => {
    const message = "boom";

    const error = new CbhError(message);

    expect(error.message).toBe(message);
  });

  it("accepts empty array", () => {
    const error = new CbhError([]);

    expect(error.message).toBe("Unknown error");
  });

  it("return left on toLeft", () => {
    const error = toLeft("boom");

    ok(E.isLeft(error));
    expect(error.left.issues[0]!.message).toBe("boom");
  });
});
