import { failure, ServiceError, type ServiceResult, success } from "@clipboard-health/util-ts";

import { expectToBeSuccess } from "./expectToBeSuccess";

describe("expectToBeSuccess", () => {
  interface TestCase {
    input: ServiceResult<number> | undefined;
    name: string;
  }

  it.each<TestCase>([
    {
      name: "passes for Success",
      input: success(123),
    },
  ])("$name", ({ input }) => {
    expect(() => {
      expectToBeSuccess(input);
    }).not.toThrow();
  });

  it.each<TestCase>([
    {
      name: "throws for Failure",
      input: failure(new ServiceError("test error")),
    },
    {
      name: "throws for undefined",
      input: undefined,
    },
  ])("$name", ({ input }) => {
    expect(() => {
      expectToBeSuccess(input);
    }).toThrow();
  });

  it("narrows type", () => {
    const actual = success(123);

    expectToBeSuccess(actual);

    // Narrowed to Right (Success)
    expect(actual.right).toBe(123);
  });
});
