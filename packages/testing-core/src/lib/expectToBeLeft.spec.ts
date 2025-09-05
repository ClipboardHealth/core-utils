import {
  either as E,
  failure,
  ServiceError,
  type ServiceResult,
  success,
} from "@clipboard-health/util-ts";

import { expectToBeFailure } from "./expectToBeFailure";
import { expectToBeLeft } from "./expectToBeLeft";

describe("expectToBeLeft", () => {
  interface TestCase {
    input: E.Either<string, number> | undefined;
    name: string;
  }

  it.each<TestCase>([
    {
      name: "passes for Left",
      input: E.left("error"),
    },
  ])("$name", ({ input }) => {
    expect(() => {
      expectToBeLeft(input);
    }).not.toThrow();
  });

  it.each<TestCase>([
    {
      name: "throws for Right",
      input: E.right(123),
    },
    {
      name: "throws for undefined",
      input: undefined,
    },
  ])("$name", ({ input }) => {
    expect(() => {
      expectToBeLeft(input);
    }).toThrow();
  });

  it("narrows type", () => {
    const actual = E.left("error");

    expectToBeLeft(actual);

    // Narrowed to Left
    expect(actual.left).toBe("error");
  });
});

describe("expectToBeFailure", () => {
  interface TestCase {
    input: ServiceResult<number> | undefined;
    name: string;
  }

  it.each<TestCase>([
    {
      name: "passes for Failure",
      input: failure(new ServiceError("test error")),
    },
  ])("$name", ({ input }) => {
    expect(() => {
      expectToBeFailure(input);
    }).not.toThrow();
  });

  it.each<TestCase>([
    {
      name: "throws for Success",
      input: success(123),
    },
    {
      name: "throws for undefined",
      input: undefined,
    },
  ])("$name", ({ input }) => {
    expect(() => {
      expectToBeFailure(input);
    }).toThrow();
  });

  it("narrows type", () => {
    const serviceError = new ServiceError("test error");
    const actual = failure(serviceError);

    expectToBeFailure(actual);

    // Narrowed to Left (Failure)
    expect(actual.left).toBe(serviceError);
    expect(actual.left).toBeInstanceOf(ServiceError);
  });
});
