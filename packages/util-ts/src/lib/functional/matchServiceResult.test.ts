import { ServiceError } from "../errors/serviceError";
import { matchServiceResult } from "./matchServiceResult";
import { failure, type ServiceResult, success } from "./serviceResult";

class FirstTestServiceError extends ServiceError {
  public readonly _tag = "FirstTestServiceError" as const;
}

class SecondTestServiceError extends ServiceError {
  public readonly _tag = "SecondTestServiceError" as const;
}

class BroadTagTestServiceError extends ServiceError {
  public get _tag(): string {
    return "BroadTagTestServiceError";
  }
}

type TestServiceError = FirstTestServiceError | SecondTestServiceError;

type MatchOutput =
  | { kind: "success"; value: number }
  | { error: FirstTestServiceError; kind: "first" }
  | { error: SecondTestServiceError; kind: "second" };

describe(matchServiceResult, () => {
  it("maps a successful result", () => {
    const result = createSuccessResult();

    const actual = matchServiceResult(result, {
      onSuccess: (value) => ({ kind: "success" as const, value }),
      onError: {
        FirstTestServiceError: (error) => ({ error, kind: "first" as const }),
        SecondTestServiceError: (error) => ({ error, kind: "second" as const }),
      },
    });

    expectTypeOf(actual).toEqualTypeOf<MatchOutput>();
    expect(actual).toStrictEqual({ kind: "success", value: 42 });
  });

  it("dispatches a failure to its exactly typed tag handler", () => {
    const input = new SecondTestServiceError("second failure");
    const result = createFailureResult(input);

    const actual = matchServiceResult(result, {
      onSuccess: (value) => ({ kind: "success" as const, value }),
      onError: {
        FirstTestServiceError: (error) => {
          expectTypeOf(error).toEqualTypeOf<FirstTestServiceError>();
          return { error, kind: "first" as const };
        },
        SecondTestServiceError: (error) => {
          expectTypeOf(error).toEqualTypeOf<SecondTestServiceError>();
          return { error, kind: "second" as const };
        },
      },
    });

    expect(actual).toStrictEqual({ error: input, kind: "second" });
  });

  it("requires a handler for every error tag", () => {
    const result = createSuccessResult();

    const actual = matchServiceResult(result, {
      onSuccess: () => "success",
      // @ts-expect-error: SecondTestServiceError handler is required
      onError: {
        FirstTestServiceError: () => "first",
      },
    });

    expect(actual).toBe("success");
  });

  it("rejects handlers outside the error union", () => {
    const result = createSuccessResult();

    const actual = matchServiceResult(result, {
      onSuccess: () => "success",
      onError: {
        FirstTestServiceError: () => "first",
        SecondTestServiceError: () => "second",
        // @ts-expect-error: handlers must correspond to a member of the error union
        UnexpectedServiceError: () => "unexpected",
      },
    });

    expect(actual).toBe("success");
  });

  it("requires literal error tags", () => {
    const result: ServiceResult<number, BroadTagTestServiceError> = success(42);

    const actual = matchServiceResult(
      // @ts-expect-error: a broad string tag cannot be matched exhaustively
      result,
      {
        onSuccess: () => "success",
        onError: {},
      },
    );

    expect(actual).toBe("success");
  });

  it("rejects a failure whose handler is missing at runtime", () => {
    const input = new SecondTestServiceError("second failure");
    const result = createFailureResult(input);
    const onError = {
      FirstTestServiceError: () => "first",
      SecondTestServiceError: () => "second",
    };
    Reflect.deleteProperty(onError, "SecondTestServiceError");

    const actual = () =>
      matchServiceResult(result, {
        onSuccess: () => "success",
        onError,
      });

    expect(actual).toThrow("Missing ServiceResult error handler for SecondTestServiceError");
  });
});

function createSuccessResult(): ServiceResult<number, TestServiceError> {
  return success(42);
}

function createFailureResult(error: TestServiceError): ServiceResult<number, TestServiceError> {
  return failure(error);
}
