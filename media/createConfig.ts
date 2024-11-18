import { deepFreeze } from "@clipboard-health/util-ts";
import dotenv from "dotenv";
import { fromZodError } from "zod-validation-error";

import { resolve } from "./internal/resolver";
import { type ConfigParams } from "./types";

dotenv.config();

/**
 * Type-safe static configuration management: a pure function to resolve, validate against a Zod
 * schema, and freeze configuration values.
 *
 * Configuration values resolve in order from highest precedence to lowest:
 * 1. Environment variables
 *    - Resolved converting configuration path from camelCase to UPPER_SNAKE. For example, the `{
 *      myApi: { port: 3000 } }` configuration resolves to `MY_API_PORT`.
 * 2. Environment-specific overrides, {@link ConfigValue.overrides}
 * 3. Default values, {@link ConfigValue.defaultValue}
 *
 * Supported configuration value types:
 * - bigint
 * - boolean
 * - date
 * - number
 * - string
 * - arrays and nested objects using the above types
 *
 * To override arrays with environment variables, use stringified JSON arrays, e.g. `["a","b"]`.
 *
 * **IMPORTANT**: To avoid runtime errors:
 * 1. Environment variables are strings, so use `z.coerce` Zod types for those you plan to override.
 *    Note that `z.coerce.boolean()` coerces any truthy value to `true`. To restrict to `"true" |
 *    "false"`, use the `booleanString` schema from `@clipboard-health/contract-core`.
 * 2. The resulting configuration is deeply frozen and will throw a runtime error if you attempt to
 *    modify it. The actual return type is `ReadonlyDeep<SchemaT>`, but the library returns a
 *    `Readonly<SchemaT>` because the former prevents clients from passing configuration values to
 *    functions that don't explicitly accept `readonly` types.
 *
 * @example
 * ```ts
 * // packages/config/examples/config.ts
 * import { ok } from "node:assert/strict";
 *
 * import { createConfig } from "@clipboard-health/config";
 * import { z } from "zod";
 *
 * const allowed = ["local", "development", "production"] as const;
 * type Allowed = (typeof allowed)[number];
 *
 * function createEnvironmentConfig(current: Allowed) {
 *   return createConfig({
 *     config: {
 *       baseUrl: {
 *         defaultValue: "http://localhost:3000",
 *         description: "Base URL for API requests",
 *         overrides: {
 *           development: "https://dev.example.com",
 *           production: "https://api.example.com",
 *         },
 *       },
 *       database: {
 *         port: {
 *           defaultValue: 5432,
 *           description: "Database port",
 *         },
 *       },
 *     },
 *     environment: { allowed, current },
 *     schema: z.object({
 *       baseUrl: z.string().url(),
 *       database: z.object({
 *         // Use `z.coerce` to override with environment variables.
 *         port: z.coerce.number().min(1024).max(65_535),
 *       }),
 *     }),
 *   });
 * }
 *
 * {
 *   // Uses default values.
 *   const config = createEnvironmentConfig("local");
 *   ok(config.baseUrl === "http://localhost:3000");
 *   ok(config.database.port === 5432);
 * }
 *
 * {
 *   // Uses baseUrl environment override.
 *   const config = createEnvironmentConfig("development");
 *   ok(config.baseUrl === "https://dev.example.com");
 *   ok(config.database.port === 5432);
 * }
 *
 * // Uses environment variable overrides.
 * const original = { ...process.env };
 * try {
 *   process.env["BASE_URL"] = "https://staging.example.com";
 *   process.env["DATABASE_PORT"] = "54320";
 *
 *   const config = createEnvironmentConfig("local");
 *   ok(config.baseUrl === "https://staging.example.com");
 *   ok(config.database.port === 54_320);
 * } finally {
 *   process.env = { ...original };
 * }
 *
 * ```
 *
 * @throws {Error} When configuration values fail schema validation
 * @returns A deeply frozen configuration object matching the provided schema
 */
export function createConfig<
  const SchemaT extends Record<string, unknown>,
  const EnvironmentT extends readonly string[],
>(params: Readonly<ConfigParams<SchemaT, EnvironmentT>>): Readonly<SchemaT> {
  const { config, environment, schema } = params;
  const { current } = environment;

  const result = schema.safeParse(resolve({ config, environment: current, path: [], schema }));
  if (!result.success) {
    throw new Error(`Configuration validation failed: ${fromZodError(result.error).toString()}`, {
      cause: result.error,
    });
  }

  return deepFreeze(result.data);
}
