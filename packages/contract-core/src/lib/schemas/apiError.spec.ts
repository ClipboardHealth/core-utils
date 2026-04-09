import {
  expectToBeSafeParseError,
  expectToBeSafeParseSuccess,
} from "@clipboard-health/testing-core";

import { type ApiError, apiErrors } from "./apiError";

describe("apiErrors", () => {
  it.each<{ input: { errors: ApiError[] }; name: string }>([
    {
      name: "parses empty errors array",
      input: { errors: [] },
    },
    {
      name: "parses valid single error",
      input: {
        errors: [
          {
            code: "InvalidArgument",
            id: "123e4567-e89b-12d3-a456-426614174000",
            status: "400",
            title: "Bad Request",
          },
        ],
      },
    },
    {
      name: "parses valid multiple errors",
      input: {
        errors: [
          {
            code: "InvalidArgument",
            id: "123e4567-e89b-12d3-a456-426614174000",
            status: "400",
            title: "Bad Request",
          },
          {
            code: "BadRequest",
            detail: "Additional error details",
            id: "223e4567-e89b-12d3-a456-426614174001",
            status: "404",
            title: "Not Found",
          },
        ],
      },
    },
  ])("$name", ({ input }) => {
    const actual = apiErrors.safeParse(input);

    expectToBeSafeParseSuccess(actual);
    expect(actual.data).toEqual(input);
  });

  it.each<{ errorMessage: string; input: unknown; name: string }>([
    {
      name: "rejects missing required fields",
      input: {
        errors: [
          {
            code: "InvalidArgument",
            status: "400",
          },
        ],
      },
      errorMessage: "Required",
    },
    {
      name: "rejects non-string values",
      input: {
        errors: [
          {
            code: 123,
            id: "123e4567-e89b-12d3-a456-426614174000",
            status: 400,
            title: "Bad Request",
          },
        ],
      },
      errorMessage: "Expected string, received number",
    },
  ])("$name", ({ input, errorMessage }) => {
    const actual = apiErrors.safeParse(input);

    expectToBeSafeParseError(actual);
    expect(actual.error.message).toContain(errorMessage);
  });
});
