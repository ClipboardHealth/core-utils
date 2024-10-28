import { ok } from "node:assert/strict";

import { createConfig } from "@clipboard-health/config";
import { z } from "zod";

const allowed = ["local", "development", "production"] as const;
type Allowed = (typeof allowed)[number];

function createEnvironmentConfig(current: Allowed) {
  return createConfig({
    config: {
      baseUrl: {
        defaultValue: "http://localhost:3000",
        description: "Base URL for API requests",
        overrides: {
          development: "https://dev.example.com",
          production: "https://api.example.com",
        },
      },
      database: {
        port: {
          defaultValue: 5432,
          description: "Database port",
        },
      },
    },
    environment: { allowed, current },
    schema: z.object({
      baseUrl: z.string().url(),
      database: z.object({
        // Use `z.coerce` to override with environment variables.
        port: z.coerce.number().min(1024).max(65_535),
      }),
    }),
  });
}

{
  // Uses default values.
  const config = createEnvironmentConfig("local");
  ok(config.baseUrl === "http://localhost:3000");
  ok(config.database.port === 5432);
}

{
  // Uses baseUrl environment override.
  const config = createEnvironmentConfig("development");
  ok(config.baseUrl === "https://dev.example.com");
  ok(config.database.port === 5432);
}

// Uses environment variable overrides.
const original = { ...process.env };
try {
  process.env["BASE_URL"] = "https://staging.example.com";
  process.env["DATABASE_PORT"] = "54320";

  const config = createEnvironmentConfig("local");
  ok(config.baseUrl === "https://staging.example.com");
  ok(config.database.port === 54_320);
} finally {
  process.env = { ...original };
}
