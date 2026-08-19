# @clipboard-health/oxlint-plugin

Clipboard's custom Oxlint rules. Consumers should normally use the presets exported by
`@clipboard-health/oxlint-config`.

The package is independent of ESLint and `@typescript-eslint`. Its standard `create(context)`
rules are also re-exported by `@clipboard-health/eslint-plugin` for repositories that still use
ESLint.

## Rules

- `enforce-ts-rest-in-controllers`
- `no-empty-boolean-call`
- `no-cross-contract-imports`
- `require-contract-fixture-construction`
- `require-contract-response-parse`
- `require-http-module-factory`
- `require-run-validators-with-upsert`
- `require-zod-import-in-contracts`

## Configuration

Use the `customRules` preset from `@clipboard-health/oxlint-config` to register the plugin and
apply the shared controller, module, contract, and cross-contract-import scopes. The
`contractFixtures` preset enables fixture-construction checks in tests.

`no-empty-boolean-call`, `require-contract-response-parse`, and
`require-run-validators-with-upsert` are opt-in because their safe adoption scope is
repository-specific.
