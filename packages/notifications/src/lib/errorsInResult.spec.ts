import { failure, ServiceError, success } from "@clipboard-health/util-ts";

import { ERROR_CODES, type ErrorCode, type TriggerResponse } from "..";
import { errorsInResult } from "./errorsInResult";

const errors: ErrorCode[] = [ERROR_CODES.unknown];

describe("errorsInResult", () => {
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
          code: "nonRetryableCode" as ErrorCode,
          message: "Non-retryable error",
        },
      ],
    });
    const input = failure(mockNonRetryableError);

    const actual = errorsInResult(input, errors);

    expect(actual).toBe(false);
  });
});
