// packages/config/README.md,packages/config/src/lib/createConfig.ts
Type-safe static configuration management: a pure function to resolve, validate against a Zod
schema, and freeze configuration values.

Configuration values resolve in order from highest precedence to lowest:

1. Environment variables
   - Resolved converting configuration path from camelCase to UPPER_SNAKE. For example, the `{
myApi: { port: 3000 } }` configuration resolves to `MY_API_PORT`.
2. Environment-specific overrides, {@link ConfigValue.overrides}
3. Default values, {@link ConfigValue.defaultValue}

Supported configuration value types:

- bigint
- boolean
- date
- number
- string
- arrays and nested objects using the above types

To override arrays with environment variables, use stringified JSON arrays, e.g. `["a","b"]`.

**IMPORTANT**: To avoid runtime errors:

1. Environment variables are strings, so use `z.coerce` Zod types for those you plan to override.
   Note that `z.coerce.boolean()` coerces any truthy value to `true`. To restrict to `"true" |
"false"`, use the `booleanString` schema from `@clipboard-health/contract-core`.
2. The resulting configuration is deeply frozen and will throw a runtime error if you attempt to
   modify it. The actual return type is `ReadonlyDeep<SchemaT>`, but the library returns a
   `Readonly<SchemaT>` because the former prevents clients from passing configuration values to
   functions that don't explicitly accept `readonly` types.
