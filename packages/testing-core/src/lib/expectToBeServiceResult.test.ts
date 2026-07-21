import { failure, ServiceError, type ServiceResult, success } from "@clipboard-health/util-ts";

import { expectToBeFailure } from "./expectToBeFailure";
import { expectToBeSuccess } from "./expectToBeSuccess";

class TestServiceError extends ServiceError {
  public readonly _tag = "TestServiceError" as const;
}

describe("ServiceResult expectations", () => {
  it("preserves the typed error when expecting a failure", () => {
    const input = createFailure(new TestServiceError("test error"));

    expectToBeFailure(input);

    expectTypeOf(input.error).toEqualTypeOf<TestServiceError>();
  });

  it("accepts a success with a typed error channel", () => {
    const input: ServiceResult<string, TestServiceError> = success("value");

    expectToBeSuccess(input);

    expectTypeOf(input.value).toEqualTypeOf<string>();
  });
});

function createFailure(error: TestServiceError): ServiceResult<string, TestServiceError> {
  return failure(error);
}
