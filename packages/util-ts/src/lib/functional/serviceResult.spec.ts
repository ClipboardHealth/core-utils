import { ok } from "node:assert/strict";

import { either as E } from "@clipboard-health/util-ts";
import { z } from "zod";

import { ERROR_CODES, ServiceError } from "../errors/serviceError";
import { failure, fromSafeParseReturnType, success } from "./serviceResult";

describe("ServiceResult", () => {
  describe("success", () => {
    it("creates success result", () => {
      const input = { data: "test" };

      const actual = success(input);

      ok(E.isRight(actual));
      expect(actual.right).toEqual(input);
    });
  });

  describe("failure", () => {
    it("creates failure result from ServiceErrorParams", () => {
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

    it("creates failure result from ServiceError", () => {
      const input = new ServiceError("test error");

      const actual = failure(input);

      ok(E.isLeft(actual));
      expect(actual.left).toBe(input);
      expect(actual.left.issues).toEqual([
        { code: ERROR_CODES.internal, title: "Internal server error", message: "test error" },
      ]);
    });
  });

  describe("fromSafeParseReturnType", () => {
    it("returns success result when parse succeeds", () => {
      const schema = z.string();
      const input = "test";

      const actual = fromSafeParseReturnType(schema.safeParse(input));

      ok(E.isRight(actual));
      expect(actual.right).toBe("test");
    });

    it("returns failure result when parse fails", () => {
      const schema = z.string();
      const input = 42;

      const actual = fromSafeParseReturnType(schema.safeParse(input));

      ok(E.isLeft(actual));
      expect(actual.left).toBeInstanceOf(ServiceError);
      expect(actual.left.issues).toEqual([
        {
          code: ERROR_CODES.badRequest,
          title: "Invalid or malformed request",
          message: "Expected string, received number",
          path: [],
        },
      ]);
    });
  });
});
