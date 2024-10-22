import {
  expectToBeSafeParseError,
  expectToBeSafeParseSuccess,
} from "@clipboard-health/testing-core";

import { uuid } from "./uuid";

describe("uuid", () => {
  it.each<{ name: string; input: string }>([
    {
      name: "accepts valid UUID v4",
      input: "2a1e3d7e-f068-4db8-8337-ddae8b67447d",
    },
    {
      name: "accepts valid UUID v7",
      input: "0192b548-9f2d-7e92-a4e5-46d4a3aca35d",
    },
    {
      name: "accepts uppercase UUID",
      input: "2A1E3D7E-F068-4DB8-8337-DDAE8B67447D",
    },
  ])("$name", ({ input }) => {
    const actual = uuid.safeParse(input);

    expectToBeSafeParseSuccess(actual);
    expect(actual.data).toBe(input);
  });

  it.each<{ name: string; input: unknown; errorMessage: string }>([
    {
      name: "rejects non-string input",
      input: 123,
      errorMessage: "Expected string, received number",
    },
    {
      name: "rejects invalid UUID format",
      input: "not-a-uuid",
      errorMessage: "Invalid",
    },
    {
      name: "rejects UUID with invalid characters",
      input: "123e4567-e89b-12d3-a456-42661417400g",
      errorMessage: "Invalid",
    },
    {
      name: "rejects UUID with incorrect length",
      input: "123e4567-e89b-12d3-a456-4266141740",
      errorMessage: "Invalid",
    },
  ])("$name", ({ input, errorMessage }) => {
    const actual = uuid.safeParse(input);

    expectToBeSafeParseError(actual);
    expect(actual.error.message).toContain(errorMessage);
  });
});
