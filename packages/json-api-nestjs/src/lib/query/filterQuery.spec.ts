import { booleanString } from "@clipboard-health/contract-core";
import {
  expectToBeSafeParseError,
  expectToBeSafeParseSuccess,
} from "@clipboard-health/testing-core";
import { z } from "zod";

import { filterQuery } from "./filterQuery";

describe("filterQuery", () => {
  const filterSchema = z.object(
    filterQuery({
      age: {
        filters: ["eq", "ne", "gt", "gte", "lt", "lte"],
        schema: z.coerce.number().int().positive(),
      },
      dateOfBirth: {
        filters: ["gte"],
        schema: z.coerce.date().min(new Date("1900-01-01")),
      },
      isActive: {
        filters: ["eq"],
        schema: booleanString,
      },
    }),
  );

  describe("success cases", () => {
    it.each<{
      expected: { filter?: Record<string, unknown> };
      input: { filter?: Record<string, unknown> };
      name: string;
    }>([
      {
        name: "accepts valid filters",
        input: {
          filter: {
            age: {
              eq: "30",
              gt: "25",
              lte: "40",
            },
            dateOfBirth: {
              gte: "1990-01-01",
            },
            isActive: {
              eq: "true",
            },
          },
        },
        expected: {
          filter: {
            age: {
              eq: [30],
              gt: [25],
              lte: [40],
            },
            dateOfBirth: {
              gte: [new Date("1990-01-01")],
            },
            isActive: {
              eq: ["true"],
            },
          },
        },
      },
      {
        name: "allows omitting filters and API types",
        input: {
          filter: {
            age: {
              eq: "30",
            },
          },
        },
        expected: {
          filter: {
            age: {
              eq: [30],
            },
          },
        },
      },
      {
        name: "parses comma-separated string input",
        input: {
          filter: {
            age: {
              eq: "30,40",
              gt: "25",
            },
          },
        },
        expected: {
          filter: {
            age: {
              eq: [30, 40],
              gt: [25],
            },
          },
        },
      },
      {
        name: "handles single value as eq filter",
        input: {
          filter: {
            age: "30",
          },
        },
        expected: {
          filter: {
            age: {
              eq: [30],
            },
          },
        },
      },
      {
        name: "handles mixed single value and object filters",
        input: {
          filter: {
            age: {
              "30": true,
              gt: "25",
            },
          },
        },
        expected: {
          filter: {
            age: {
              eq: [30],
              gt: [25],
            },
          },
        },
      },
      {
        name: "allows empty object",
        input: {},
        expected: {},
      },
    ])("$name", ({ input, expected }) => {
      const actual = filterSchema.safeParse(input);

      expectToBeSafeParseSuccess(actual);
      expect(actual.data).toEqual(expected);
    });
  });

  describe("error cases", () => {
    it.each<{ expectedError: string; input: unknown; name: string }>([
      {
        name: "rejects invalid filter types",
        input: {
          filter: {
            age: {
              eq: "invalid",
            },
          },
        },
        expectedError: "Expected number, received nan",
      },
      {
        name: "rejects invalid filter type",
        input: {
          filter: {
            age: {
              invalid: "30",
            },
          },
        },
        expectedError: "Unrecognized key(s) in object: 'invalid'",
      },
      {
        name: "rejects unknown API type",
        input: {
          filter: {
            invalid: {
              eq: "30",
            },
          },
        },
        expectedError: "Unrecognized key(s) in object: 'invalid'",
      },
    ])("$name", ({ input, expectedError }) => {
      const actual = filterSchema.safeParse(input);

      expectToBeSafeParseError(actual);
      expect(actual.error.message).toContain(expectedError);
    });
  });
});
