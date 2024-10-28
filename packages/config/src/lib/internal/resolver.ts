import { z } from "zod";

import { type ConfigValue, type ConfigValueMap } from "../types";
import { camelToUpperSnake } from "./camelToUpperSnake";
import { isDefined } from "./isDefined";

interface ResolveParams<SchemaT extends Record<string, unknown>> {
  config: Readonly<ConfigValueMap<SchemaT, string>>;
  environment: string;
  path: readonly string[];
  schema: z.ZodType<SchemaT>;
}

type ResolveConfigValueParams = Pick<
  ResolveParams<Record<string, unknown>>,
  "environment" | "path" | "schema"
> & {
  value: Readonly<ConfigValue<unknown, string>>;
};

export function resolve<SchemaT extends Record<string, unknown>>(
  params: Readonly<ResolveParams<SchemaT>>,
): Record<string, unknown> {
  const { config, environment, path, schema } = params;

  return Object.fromEntries(
    Object.entries(config).map<[string, unknown]>(
      ([key, value]: [string, ConfigValueMap<SchemaT, string>]) => [
        key,
        isConfigValue(value)
          ? resolveConfigValue({ environment, path: [...path, key], schema, value })
          : resolve({ ...params, config: value, path: [...path, key] }),
      ],
    ),
  );
}

function isConfigValue(value: unknown): value is ConfigValue<unknown, string> {
  return (
    typeof value === "object" &&
    isDefined(value) &&
    "description" in value &&
    "defaultValue" in value
  );
}

function resolveConfigValue(params: ResolveConfigValueParams): unknown {
  const { environment, path, schema, value } = params;

  const variable = process.env[camelToUpperSnake(path)];
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
