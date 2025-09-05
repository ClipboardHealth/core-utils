import { either as E } from "@clipboard-health/util-ts";
import { z } from "zod";

import { ERROR_CODES, ServiceError } from "../errors/serviceError";
import {
  failure,
  fromSafeParseReturnType,
  isFailure,
  isSuccess,
  mapFailure,
  success,
  tryCatch,
  tryCatchAsync,
} from "./serviceResult";

describe("ServiceResult", () => {
  describe("success", () => {
    it("creates success result", () => {
      const input = { data: "test" };

      const actual = success(input) as E.Right<{ data: string }>;

      expect(isSuccess(actual)).toBe(true);
      expect(isFailure(actual)).toBe(false);
      expect(actual.isRight).toBe(true);
      expect(actual.right).toEqual(input);
    });
  });

  describe("failure", () => {
    it("creates failure result from ServiceErrorParams", () => {
      const input = {
        issues: [{ code: ERROR_CODES.notFound }],
      };

      const actual = failure(input) as E.Left<ServiceError>;

      expect(isFailure(actual)).toBe(true);
      expect(isSuccess(actual)).toBe(false);
      expect(actual.isRight).toBe(false);
      expect(actual.left).toBeInstanceOf(ServiceError);
      expect(actual.left.issues).toEqual([
        { code: ERROR_CODES.notFound, title: "Resource not found" },
      ]);
    });

    it("creates failure result from ServiceError", () => {
      const input = new ServiceError("test error");

      const actual = failure(input) as E.Left<ServiceError>;

      expect(isFailure(actual)).toBe(true);
      expect(isSuccess(actual)).toBe(false);
      expect(actual.isRight).toBe(false);
      expect(actual.left).toBe(input);
      expect(actual.left.issues).toEqual([
        { code: ERROR_CODES.internal, title: "Internal server error", message: "test error" },
      ]);
    });
  });

  describe("tryCatchAsync", () => {
    it("returns success result when promise resolves", async () => {
      const actual = (await tryCatchAsync(
        async () => await Promise.resolve("test data"),
        (error: unknown) => new ServiceError(`Promise error: ${String(error)}`),
      )) as E.Right<string>;

      expect(isSuccess(actual)).toBe(true);
      expect(actual.isRight).toBe(true);
      expect(actual.right).toBe("test data");
    });

    it("returns failure result when promise rejects", async () => {
      const onError = (error: unknown) => new ServiceError(`Promise error: ${String(error)}`);

      const actual = (await tryCatchAsync(
        async () => await Promise.reject(new Error("Promise failed")),
        onError,
      )) as E.Left<ServiceError>;

      expect(isFailure(actual)).toBe(true);
      expect(actual.isRight).toBe(false);
      expect(actual.left).toBeInstanceOf(ServiceError);
      expect(actual.left.issues[0]?.message).toBe("Promise error: Error: Promise failed");
    });

    it("uses custom error handler when promise rejects", async () => {
      const onError = (error: unknown) =>
        new ServiceError({
          issues: [{ code: ERROR_CODES.notFound, message: `Custom: ${String(error)}` }],
        });

      const actual = (await tryCatchAsync(
        async () => await Promise.reject(new Error("custom error")),
        onError,
      )) as E.Left<ServiceError>;

      expect(isFailure(actual)).toBe(true);
      expect(actual.left.issues).toEqual([
        {
          code: ERROR_CODES.notFound,
          title: "Resource not found",
          message: "Custom: Error: custom error",
        },
      ]);
    });
  });

  describe("tryCatch", () => {
    it("returns success result when function executes successfully", () => {
      const actual = tryCatch(
        () => "success value",
        (error: unknown) => new ServiceError(`Function error: ${String(error)}`),
      ) as E.Right<string>;

      expect(isSuccess(actual)).toBe(true);
      expect(actual.isRight).toBe(true);
      expect(actual.right).toBe("success value");
    });

    it("returns failure result when function throws", () => {
      const onError = (error: unknown) => new ServiceError(`Function error: ${String(error)}`);

      const actual = tryCatch(() => {
        throw new Error("Function failed");
      }, onError) as E.Left<ServiceError>;

      expect(isFailure(actual)).toBe(true);
      expect(actual.isRight).toBe(false);
      expect(actual.left).toBeInstanceOf(ServiceError);
      expect(actual.left.issues[0]?.message).toBe("Function error: Error: Function failed");
    });

    it("uses custom error handler when function throws", () => {
      const onError = (error: unknown) =>
        new ServiceError({
          issues: [{ code: ERROR_CODES.badRequest, message: `Parse error: ${String(error)}` }],
        });

      const actual = tryCatch(() => {
        throw new Error("string error");
      }, onError) as E.Left<ServiceError>;

      expect(isFailure(actual)).toBe(true);
      expect(actual.left.issues).toEqual([
        {
          code: ERROR_CODES.badRequest,
          title: "Invalid or malformed request",
          message: "Parse error: Error: string error",
        },
      ]);
    });

    it("handles JSON.parse example", () => {
      const invalidJson = "{ invalid json }";
      const parseJson = tryCatch(
        () => JSON.parse(invalidJson) as unknown,
        (error) =>
          new ServiceError({
            issues: [
              { code: ERROR_CODES.badRequest, message: `JSON parse error: ${String(error)}` },
            ],
          }),
      ) as E.Left<ServiceError>;

      expect(isFailure(parseJson)).toBe(true);
      expect(parseJson.left.issues[0]?.code).toBe(ERROR_CODES.badRequest);
      expect(parseJson.left.issues[0]?.message).toContain("JSON parse error");
    });
  });

  describe("mapFailure", () => {
    it("transforms error when ServiceResult is failure", () => {
      const serviceError = new ServiceError("original error");
      const failureResult = failure(serviceError);
      const transformError = mapFailure(
        (error: ServiceError) => error.issues[0]?.message ?? "no message",
      );

      const actual = transformError(failureResult) as E.Left<string>;

      expect(E.isLeft(actual)).toBe(true);
      expect(actual.left).toBe("original error");
    });

    it("leaves success unchanged", () => {
      const successResult = success("success data");
      const transformError = mapFailure(
        (error: ServiceError) => error.issues[0]?.message ?? "no message",
      );

      const actual = transformError(successResult) as E.Right<string>;

      expect(E.isRight(actual)).toBe(true);
      expect(actual.right).toBe("success data");
    });

    it("transforms error to different type", () => {
      const serviceError = new ServiceError({
        issues: [{ code: ERROR_CODES.notFound, message: "Resource not found" }],
      });
      const failureResult = failure(serviceError);
      const transformError = mapFailure((error: ServiceError) => ({
        errorCode: error.issues[0]?.code,
        errorMessage: error.issues[0]?.message,
      }));

      const actual = transformError(failureResult) as E.Left<{
        errorCode: string | undefined;
        errorMessage: string | undefined;
      }>;

      expect(E.isLeft(actual)).toBe(true);
      expect(actual.left).toEqual({
        errorCode: ERROR_CODES.notFound,
        errorMessage: "Resource not found",
      });
    });

    it("can be chained with other operations", () => {
      const serviceError = new ServiceError("test error");
      const failureResult = failure(serviceError);

      const pipeline1 = mapFailure(
        (error: ServiceError) => `Transformed: ${error.issues[0]?.message}`,
      );
      const result1 = pipeline1(failureResult) as E.Left<string>;

      expect(E.isLeft(result1)).toBe(true);
      expect(result1.left).toBe("Transformed: test error");
    });
  });

  describe("fromSafeParseReturnType", () => {
    it("returns success result when parse succeeds", () => {
      const schema = z.string();
      const input = "test";

      const actual = fromSafeParseReturnType(schema.safeParse(input)) as E.Right<string>;

      expect(isSuccess(actual)).toBe(true);
      expect(actual.isRight).toBe(true);
      expect(actual.right).toBe("test");
    });

    it("returns failure result when parse fails", () => {
      const schema = z.string();
      const input = 42;

      const actual = fromSafeParseReturnType(schema.safeParse(input)) as E.Left<ServiceError>;

      expect(isFailure(actual)).toBe(true);
      expect(actual.isRight).toBe(false);
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

    it("handles complex schema validation", () => {
      const schema = z.object({
        name: z.string(),
        age: z.number().min(0),
      });
      const input = { name: 123, age: -5 };

      const actual = fromSafeParseReturnType(schema.safeParse(input)) as E.Left<ServiceError>;

      expect(isFailure(actual)).toBe(true);
      expect(actual.left).toBeInstanceOf(ServiceError);
      expect(actual.left.issues).toHaveLength(2);
    });
  });

  describe("handleError (via tryCatch and tryCatchAsync)", () => {
    it("uses onError to convert error to ServiceError", () => {
      const customError = new Error("custom error message");
      const onError = (error: unknown) => new ServiceError(`Wrapped: ${String(error)}`);

      const actual = tryCatch(() => {
        throw customError;
      }, onError) as E.Left<ServiceError>;

      expect(isFailure(actual)).toBe(true);
      expect(actual.left).toBeInstanceOf(ServiceError);
      expect(actual.left.issues[0]?.message).toBe("Wrapped: Error: custom error message");
    });

    it("uses onError to convert error to ServiceError with custom error params", () => {
      const customError = new Error("validation failed");
      const onError = (error: unknown) =>
        new ServiceError({
          issues: [
            {
              code: ERROR_CODES.badRequest,
              message: `Validation error: ${String(error)}`,
            },
          ],
        });

      const actual = tryCatch(() => {
        throw customError;
      }, onError) as E.Left<ServiceError>;

      expect(isFailure(actual)).toBe(true);
      expect(actual.left.issues).toEqual([
        {
          code: ERROR_CODES.badRequest,
          title: "Invalid or malformed request",
          message: "Validation error: Error: validation failed",
        },
      ]);
    });

    it("falls back to ServiceError.fromUnknown when onError throws", () => {
      const originalError = new Error("original error");
      const faultyOnError = () => {
        throw new Error("onError function failed");
      };

      const actual = tryCatch(() => {
        throw originalError;
      }, faultyOnError) as E.Left<ServiceError>;

      expect(isFailure(actual)).toBe(true);
      expect(actual.left).toBeInstanceOf(ServiceError);
      expect(actual.left.issues[0]?.message).toBe("original error");
      expect(actual.left.issues[0]?.code).toBe(ERROR_CODES.internal);
    });

    it("falls back to ServiceError.fromUnknown when onError throws (async)", async () => {
      const originalError = new Error("async original error");
      const faultyOnError = () => {
        throw new Error("async onError function failed");
      };

      const actual = (await tryCatchAsync(async () => {
        throw originalError;
      }, faultyOnError)) as E.Left<ServiceError>;

      expect(isFailure(actual)).toBe(true);
      expect(actual.left).toBeInstanceOf(ServiceError);
      expect(actual.left.issues[0]?.message).toBe("async original error");
      expect(actual.left.issues[0]?.code).toBe(ERROR_CODES.internal);
    });

    it("handles non-Error objects when onError throws", () => {
      const originalError = new Error("string error");

      const actual = tryCatch(
        () => {
          throw originalError;
        },
        () => {
          throw new TypeError("onError type error");
        },
      ) as E.Left<ServiceError>;

      expect(isFailure(actual)).toBe(true);
      expect(actual.left).toBeInstanceOf(ServiceError);
      expect(actual.left.issues[0]?.message).toBe("string error");
      expect(actual.left.issues[0]?.code).toBe(ERROR_CODES.internal);
    });

    it("handles null/undefined errors when onError throws", () => {
      const originalError = new Error("null error");

      const actual = tryCatch(
        () => {
          throw originalError;
        },
        () => {
          throw new Error("onError failed with null");
        },
      ) as E.Left<ServiceError>;

      expect(isFailure(actual)).toBe(true);
      expect(actual.left).toBeInstanceOf(ServiceError);
      expect(actual.left.issues[0]?.message).toBe("null error");
      expect(actual.left.issues[0]?.code).toBe(ERROR_CODES.internal);
    });
  });
});
