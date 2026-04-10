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
    expected?: string | RegExp;
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
      expected: /falsy value/,
    },
    {
      name: "throws for undefined",
      input: undefined,
      expected: "Expected value to be defined",
    },
  ])("$name", ({ input, expected }) => {
    expect(() => {
      expectToBeLeft(input);
    }).toThrow(expected);
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
    expected?: string | RegExp;
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
      expected: /falsy value/,
    },
    {
      name: "throws for undefined",
      input: undefined,
      expected: "Expected value to be defined",
    },
  ])("$name", ({ input, expected }) => {
    expect(() => {
      expectToBeFailure(input);
    }).toThrow(expected);
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
