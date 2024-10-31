import { isDefined } from "@clipboard-health/util-ts";
import decamelize from "decamelize";
import { z } from "zod";

import { type ConfigValue, type ConfigValueMap } from "../types";

interface ResolveParams<SchemaT extends Record<string, unknown>> {
  config: Readonly<ConfigValueMap<SchemaT, readonly string[]>>;
  environment: string;
  path: readonly string[];
  schema: z.ZodType<SchemaT>;
}

type ResolveConfigValueParams = {
  value: Readonly<ConfigValue<unknown, readonly string[]>>;
} & Pick<ResolveParams<Record<string, unknown>>, "environment" | "path" | "schema">;

export function resolve<SchemaT extends Record<string, unknown>>(
  params: Readonly<ResolveParams<SchemaT>>,
): Record<string, unknown> {
  const { config, path, ...rest } = params;

  return Object.fromEntries(
    Object.entries(config).map<[string, unknown]>(
      ([key, value]: [string, ConfigValueMap<SchemaT, readonly string[]>]) => [
        key,
        isConfigValue(value)
          ? resolveConfigValue({ ...rest, path: [...path, key], value })
          : resolve({ ...rest, config: value, path: [...path, key] }),
      ],
    ),
  );
}

function isConfigValue(value: unknown): value is ConfigValue<unknown, readonly string[]> {
  return (
    typeof value === "object" &&
    isDefined(value) &&
    "description" in value &&
    "defaultValue" in value
  );
}

function resolveConfigValue(params: ResolveConfigValueParams): unknown {
  const { environment, path, schema, value } = params;

  const variable = process.env[decamelize(path.join("_")).toUpperCase()];
  if (isDefined(variable)) {
    return parseEnvironmentVariable(variable, getSchema(path, schema));
  }

  const override = value.overrides?.[environment];
  if (isDefined(override)) {
    return override;
  }

  return value.defaultValue;
}

function parseEnvironmentVariable(value: unknown, schema: z.ZodType<unknown>): unknown {
  if (schema instanceof z.ZodArray && typeof value === "string") {
    try {
      return JSON.parse(value);
    } catch {
      return value;
    }
  }

  return value;
}

function getSchema(path: readonly string[], schema: z.ZodType<unknown>): z.ZodType<unknown> {
  return path.reduce(
    (result, key) =>
      // eslint-disable-next-line @typescript-eslint/no-unsafe-return
      result instanceof z.ZodObject ? result.shape[key] : /* istanbul ignore next */ result,
    schema,
  );
}
