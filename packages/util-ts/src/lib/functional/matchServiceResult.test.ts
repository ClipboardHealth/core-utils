import { ServiceError } from "../errors/serviceError";
import { matchServiceResult } from "./matchServiceResult";
import { failure, type ServiceResult, success } from "./serviceResult";

class FirstTestServiceError extends ServiceError {
  public readonly _tag = "FirstTestServiceError" as const;
}

class SecondTestServiceError extends ServiceError {
  public readonly _tag = "SecondTestServiceError" as const;
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
});

function createSuccessResult(): ServiceResult<number, TestServiceError> {
  return success(42);
}

function createFailureResult(error: TestServiceError): ServiceResult<number, TestServiceError> {
  return failure(error);
}
