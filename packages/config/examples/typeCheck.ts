/* eslint-disable @typescript-eslint/no-unused-expressions */
import { createConfig } from "@clipboard-health/config";
import { booleanString } from "@clipboard-health/contract-core";
import { z } from "zod";

const config = createConfig({
  config: {
    bigint: {
      defaultValue: 0n,
      description: "A big number.",
    },
    bool: {
      defaultValue: "true",
      description: "A boolean string.",
    },
    dateArray: {
      defaultValue: [new Date("2024-12-25"), new Date("2025-01-01")],
      description: "A date array.",
      overrides: {
        development: [new Date("2024-01-01")],
      },
    },
    enum: {
      defaultValue: "a",
      description: "An enum.",
    },
    literal: {
      defaultValue: "my-literal",
      description: "A literal string.",
    },
    number: {
      defaultValue: 3000,
      description: "A number.",
      overrides: {
        production: 80,
      },
    },
    object: {
      nestedDate: {
        defaultValue: new Date("2025-01-15"),
        description: "A nested date.",
      },
    },
    string: {
      defaultValue: "my-string",
      description: "A string.",
    },
  },
  environment: {
    allowed: ["development", "production"] as const,
    current: "production",
  },
  schema: z.object({
    bigint: z.coerce.bigint(),
    bool: booleanString,
    dateArray: z.array(z.coerce.date()),
    enum: z.enum(["a", "b"]),
    literal: z.literal("my-literal"),
    number: z.coerce.number().min(80).max(65_535),
    object: z.object({
      nestedDate: z.coerce.date(),
    }),
    string: z.string(),
  }),
});

const {
  bigint,
  bool,
  dateArray,
  literal,
  number,
  object: { nestedDate },
  string,
} = config;

bigint;
// ^? const bigint: bigint
bool;
// ^? const bool: "true" | "false"
dateArray;
// ^? const dateArray: Date[]
literal;
// ^? const literal: "my-literal"
number;
// ^? const number: number
nestedDate;
// ^? const nestedDate: Date
string;
// ^? const string: string

// @ts-expect-error unused
const _invalidConfig = createConfig({
  config: {
    string: {
      defaultValue: "my-string",
      description: "A string.",
      overrides: {
        // @ts-expect-error Invalid environment
        invalid: "Invalid environment",
      },
    },
  },
  environment: {
    allowed: ["development", "production"] as const,
    // @ts-expect-error Invalid environment
    current: "invalid",
  },
  schema: z.object({
    string: z.string(),
  }),
});

/* eslint-enable @typescript-eslint/no-unused-expressions */
