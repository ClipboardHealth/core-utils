import { failure, ServiceError, type ServiceResult, success } from "@clipboard-health/util-ts";

import { ERROR_CODES, type ErrorCode, type TriggerResponse } from "..";
import { errorsInResult } from "./errorsInResult";

const errors: ErrorCode[] = [ERROR_CODES.unknown];

class TestNotificationError extends ServiceError {
  public readonly _tag = "TestNotificationError" as const;
}

describe(errorsInResult, () => {
  const mockTriggerResponse: TriggerResponse = {
    id: "test-response-id",
  };

  const mockServiceError = new ServiceError({
    issues: [
      {
        code: ERROR_CODES.unknown,
        message: "Unknown error",
      },
      {
        code: ERROR_CODES.recipientCountAboveMaximum,
        message: "Recipient count above maximum",
      },
    ],
  });

  it("returns true when result is failure and no error codes are provided", () => {
    const input = failure(mockServiceError);

    const actual = errorsInResult(input);

    expect(actual).toBe(true);
  });

  it("returns true when result is failure and any error code is in `errorCodes`", () => {
    const input = failure(mockServiceError);

    const actual = errorsInResult(input, errors);

    expect(actual).toBe(true);
  });

  it("returns false when result is success", () => {
    const input = success(mockTriggerResponse);

    const actual = errorsInResult(input, errors);

    expect(actual).toBe(false);
  });

  it("returns false when result is failure but every error code is not in `errorCodes`", () => {
    const mockNonRetryableError = new ServiceError({
      issues: [
        {
          code: "nonRetryableCode",
          message: "Non-retryable error",
        },
      ],
    });
    const input = failure(mockNonRetryableError);

    const actual = errorsInResult(input, errors);

    expect(actual).toBe(false);
  });

  it("preserves the typed error when the result is a failure", () => {
    const input = failure(
      new TestNotificationError({
        issues: [{ code: ERROR_CODES.unknown, message: "Unknown error" }],
      }),
    );

    const actual = errorsInResult(input);
    const error = getNotificationError(input);

    expect(actual).toBe(true);
    expectTypeOf(error).toEqualTypeOf<TestNotificationError>();
  });
});

function getNotificationError(
  result: ServiceResult<TriggerResponse, TestNotificationError>,
): TestNotificationError {
  if (!errorsInResult(result)) {
    throw new Error("Expected matching notification error");
  }

  return result.error;
}
