import { type z } from "zod";

/**
 * Represents a single configuration value with metadata.
 */
export interface ConfigValue<SchemaT, EnvironmentT extends string> {
  /** Default value used when no override or environment variable is present */
  defaultValue: SchemaT;

  /** Human-readable description of the configuration value */
  description: string;

  /**
   * Optional environment-specific overrides.
   * @example { development: "dev-host", production: "prod-host" }
   */
  overrides?: Readonly<Partial<Record<EnvironmentT, SchemaT>>>;
}

/**
 * Maps configuration schema to configuration values with metadata.
 */
export type ConfigValueMap<SchemaT, EnvironmentT extends string> = {
  [K in keyof SchemaT]: SchemaT[K] extends unknown[]
    ? ConfigValue<SchemaT[K], EnvironmentT>
    : SchemaT[K] extends Record<string, unknown>
      ? SchemaT[K] extends Date
        ? ConfigValue<Date, EnvironmentT>
        : ConfigValueMap<SchemaT[K], EnvironmentT>
      : SchemaT[K] extends bigint
        ? ConfigValue<bigint, EnvironmentT>
        : SchemaT[K] extends z.EnumValues
          ? ConfigValue<SchemaT[K], EnvironmentT>
          : ConfigValue<SchemaT[K], EnvironmentT>;
};

/**
 * Parameters for creating a configuration instance.
 */
export interface ConfigParams<
  SchemaT extends Record<string, unknown>,
  EnvironmentT extends readonly string[],
> {
  /**
   * Configuration values resolved in order of precedence. @see {@link createConfig}.
   */
  config: Readonly<ConfigValueMap<SchemaT, EnvironmentT[number]>>;

  /**
   * The current environment and list of allowed environments.
   * @example { current: "development", allowed: ["development", "production"] as const }
   */
  environment: {
    allowed: EnvironmentT;
    current: EnvironmentT[number];
  };

  /**
   * Zod schema defining the configuration shape and validation rules.
   */
  schema: z.ZodType<SchemaT>;
}
