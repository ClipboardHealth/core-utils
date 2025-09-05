import { either as E } from "@clipboard-health/util-ts";
import { failure, ServiceError, type ServiceResult, success } from "@clipboard-health/util-ts";

import { expectToBeRight } from "./expectToBeRight";
import { expectToBeSuccess } from "./expectToBeSuccess";

describe("expectToBeRight", () => {
  interface TestCase {
    input: E.Either<string, number> | undefined;
    name: string;
  }

  it.each<TestCase>([
    {
      name: "passes for Right",
      input: E.right(123),
    },
  ])("$name", ({ input }) => {
    expect(() => {
      expectToBeRight(input);
    }).not.toThrow();
  });

  it.each<TestCase>([
    {
      name: "throws for Left",
      input: E.left("error"),
    },
    {
      name: "throws for undefined",
      input: undefined,
    },
  ])("$name", ({ input }) => {
    expect(() => {
      expectToBeRight(input);
    }).toThrow();
  });

  it("narrows type", () => {
    const actual = E.right(123);

    expectToBeRight(actual);

    // Narrowed to Right
    expect(actual.right).toBe(123);
  });
});

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
