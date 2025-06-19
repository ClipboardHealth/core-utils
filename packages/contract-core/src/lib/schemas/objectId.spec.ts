import {
  expectToBeSafeParseError,
  expectToBeSafeParseSuccess,
} from "@clipboard-health/testing-core";

import { objectId } from "./objectId";

describe("objectId", () => {
  it.each<{ input: string; name: string }>([
    {
      name: "accepts valid ObjectId with lowercase hex",
      input: "507f1f77bcf86cd799439011",
    },
    {
      name: "accepts valid ObjectId with uppercase hex",
      input: "507F1F77BCF86CD799439011",
    },
    {
      name: "accepts valid ObjectId with mixed case",
      input: "507f1F77bcF86cd799439011",
    },
  ])("$name", ({ input }) => {
    const actual = objectId.safeParse(input);

    expectToBeSafeParseSuccess(actual);
    expect(actual.data).toBe(input);
  });

  it.each<{ errorMessage: string; input: unknown; name: string }>([
    {
      name: "rejects non-string input",
      input: 123,
      errorMessage: "Expected string, received number",
    },
    {
      name: "rejects string with invalid hex character 'g'",
      input: "507f1f77bcf86cd79943901g",
      errorMessage: "Must be a valid ObjectId",
    },
    {
      name: "rejects string with special character '@'",
      input: "507f1f77bcf86cd799439@11",
      errorMessage: "Must be a valid ObjectId",
    },
    {
      name: "rejects string with special character '#'",
      input: "507f1f77bcf86cd799439#11",
      errorMessage: "Must be a valid ObjectId",
    },
    {
      name: "rejects string with special character '$'",
      input: "507f1f77bcf86cd799439$11",
      errorMessage: "Must be a valid ObjectId",
    },
    {
      name: "rejects string with unicode character",
      input: "507f1f77bcf86cd7994390ñ1",
      errorMessage: "Must be a valid ObjectId",
    },
    {
      name: "rejects string that is too short",
      input: "507f1f77bcf86cd79943901",
      errorMessage: "Must be a valid ObjectId",
    },
    {
      name: "rejects string that is too long",
      input: "507f1f77bcf86cd7994390111",
      errorMessage: "Must be a valid ObjectId",
    },
    {
      name: "rejects empty string",
      input: "",
      errorMessage: "Must be a valid ObjectId",
    },
  ])("$name", ({ input, errorMessage }) => {
    const actual = objectId.safeParse(input);

    expectToBeSafeParseError(actual);
    expect(actual.error.message).toContain(errorMessage);
  });
});
