# require-contract-response-parse

Requires response-shape assertions to validate the response body with a Zod schema imported from
an `@clipboard-health/contract-*` package. It accepts either of these forms before the assertion:

```ts
const body = parseBody(response, ExampleResponseSchema);
const body = ExampleResponseSchema.parse(response.parsedBody);
```

The rule also reports inline permissive schemas built with `z.any()` or `z.unknown()`. Those schemas
cannot prove that a response matches its published contract.

## Migration

1. Find the endpoint in its contract package and select the response schema for the asserted status
   code. This is commonly `contract.endpoint.responses[status]` or an exported `XResponseSchema`.
2. Parse the body before shape assertions and make subsequent assertions against the parsed value.
3. If no response schema exists, file a contract-gap ticket and add it to the contract package. Do
   not replace the missing contract with an inline permissive schema or an ESLint exemption.

For an existing test suite, enable the rule as a warning over the full migration scope. Migrate and
raise one directory at a time to error level. CI can suppress the warning backlog with `--quiet`, so
every error-level directory remains blocking. Once the full scope is migrated, replace the directory
overrides with a single error-level setting and restore the zero-warning budget.

## Configuration

```js
module.exports = {
  overrides: [
    {
      files: ["path/to/endpoint-tests/**/*.{ts,tsx}"],
      rules: {
        "@clipboard-health/require-contract-response-parse": "warn",
      },
    },
  ],
};
```

The rule has no options.
