import { ok } from "node:assert/strict";

import { either as E } from "@clipboard-health/util-typescript";

import { ERROR_CODES, ServiceError } from "./errors/serviceError";
import { failure, success } from "./serviceResult";

describe("ServiceResult", () => {
  it("creates success result", () => {
    const input = { data: "test" };

    const actual = success(input);

    ok(E.isRight(actual));
    expect(actual.right).toEqual(input);
  });

  it("creates failure result", () => {
    const input = {
      issues: [{ code: ERROR_CODES.notFound }],
    };

    const actual = failure(input);

    ok(E.isLeft(actual));
    expect(actual.left).toBeInstanceOf(ServiceError);
    expect(actual.left.issues).toEqual([
      { code: ERROR_CODES.notFound, title: "Resource not found" },
    ]);
  });
});
