import { type z } from "zod";

/**
 * Represents a single configuration value with metadata.
 */
export interface ConfigValue<SchemaT, EnvironmentT extends readonly string[]> {
  /** Default value used when no override or environment variable is present */
  defaultValue: SchemaT;

  /** Human-readable description of the configuration value */
  description: string;

  /**
   * Optional environment-specific overrides.
   * @example { development: "dev-host", production: "prod-host" }
   */
  overrides?: Readonly<Partial<Record<EnvironmentT[number], SchemaT>>>;
}

/**
 * Maps configuration schema to configuration values with metadata.
 */
export type ConfigValueMap<SchemaT, EnvironmentT extends readonly string[]> = {
  // eslint-disable-next-line no-use-before-define
  [K in keyof SchemaT]: ConfigValueForType<SchemaT[K], EnvironmentT>;
};

type ConfigValueForType<T, EnvironmentT extends readonly string[]> = T extends unknown[]
  ? ConfigValue<T, EnvironmentT>
  : T extends Date
    ? ConfigValue<Date, EnvironmentT>
    : T extends bigint
      ? ConfigValue<bigint, EnvironmentT>
      : T extends z.EnumValues
        ? ConfigValue<T, EnvironmentT>
        : T extends Record<string, unknown>
          ? ConfigValueMap<T, EnvironmentT>
          : ConfigValue<T, EnvironmentT>;

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
  config: Readonly<ConfigValueMap<SchemaT, EnvironmentT>>;

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
