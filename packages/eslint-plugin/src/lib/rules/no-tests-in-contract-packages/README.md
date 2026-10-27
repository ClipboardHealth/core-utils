# no-tests-in-contract-packages

Lint rule, available in both `@clipboard-health/oxlint-plugin` and
`@clipboard-health/eslint-plugin`, that forbids test files in contract packages.
`contract-core` is exempt.

## Motivation

A contract package describes a service's API. The owning service's service tests cover that
contract by sending requests through the service's real handlers, so they catch a contract that
disagrees with what the service accepts or returns. Tests inside the contract package only check
the schemas against themselves, duplicate that coverage, and run in a package that has no service
to call.

`contract-core` is a shared schema-helper library rather than a service contract, so it keeps its
unit tests.

## Rule Details

The rule reports a file once when both are true:

- Its name ends in `.spec` or `.test` followed by `.ts`, `.tsx`, `.mts`, `.cts`, `.js`, `.jsx`,
  `.mjs`, or `.cjs`.
- The directory under its innermost `packages/` path segment starts with `contract-` and is not
  `contract-core`. For example, `packages/contract-backend-main/src/lib/shift.contract.spec.ts`.

The check reads only the file path, so it never touches the file system. Both `/` and `\`
separators work.

The heuristic follows the monorepo layout where each contract package lives at
`packages/contract-<service>/`. It does not recognize a contract package stored elsewhere or a
directory whose name differs from the `contract-` convention, and it treats a `packages/`
directory nested inside a package's sources as a package boundary.

### ❌ Incorrect

```text
packages/contract-backend-main/src/lib/contracts/shift.contract.spec.ts
packages/contract-license-manager/src/index.test.ts
```

### ✅ Correct

```text
packages/contract-backend-main/src/lib/contracts/shift.contract.ts
packages/contract-core/src/lib/schemas/objectId.spec.ts
src/modules/shifts/shift.controller.spec.ts
```

## Options

None.

## When Not To Use It

In a repository whose contract packages still contain test files, move their assertions into the
service's service tests before enabling the rule.
