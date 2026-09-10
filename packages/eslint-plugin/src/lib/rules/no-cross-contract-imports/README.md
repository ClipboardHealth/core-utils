# no-cross-contract-imports

ESLint rule that forbids contract packages (`@clipboard-health/contract-*`, `@clipboard-health/api-contract-*`, `@clipboard-health/flag-*`) from importing other contract packages. `@clipboard-health/contract-core` is the one allowed shared contract dependency.

## Motivation

Contracts own the shape of their inputs and outputs. When one contract package imports another, the imported contract becomes an exact-pinned dependency of the importer, which:

- **Vendors duplicate copies into every consumer.** Contract packages pin exact versions, so the importer's copy of the imported contract almost never dedupes with the consumer's own copy. At its worst, cbh-mobile-app carried nine copies of `contract-core` and multiple full copies of `contract-backend-main` through this mechanism, constructing every Zod schema in each copy at boot (ACT-5337).
- **Risks dependency cycles.** `contract-backend-main` and `contract-home-health-api` once imported each other; exact-pinned cycles structurally never dedupe and can only be fixed by removing an edge (ACT-5356/ACT-5357).
- **Couples release trains.** The importer must bump every time the imported contract changes, even when nothing it uses changed.

Type-only imports are banned too: they still force the imported package into `dependencies` so consumers can resolve the `.d.ts`, recreating the same coupling.

Instead:

- Import shared primitives (`dateTimeSchema`, `objectId`, enum helpers, `moneySchema`) from `@clipboard-health/contract-core`.
- Duplicate the rare shared domain schema locally. Zod brands are structural, so duplicates stay type-compatible, and ts-rest response validation catches drift.
- Do not re-export or pass through another contract's schemas or endpoints.

See `rules/backend/restApiDesign.md` in `@clipboard-health/ai-rules` for the full guidance.

## Rule Details

The rule only applies inside contract packages: it walks up from the linted file to the nearest `package.json` that declares a `name` and checks it against the contract package pattern. In any other package the rule is a no-op, so it is safe to enable globally.

Within a contract package it reports every reference to another contract package, in any form: `import`/`import type`, `export … from`/`export * from`/`export type … from`, dynamic `import()`, `require()`, and `import x = require()`.

### ❌ Incorrect

```ts
import { WorkplaceIdSchema } from "@clipboard-health/contract-backend-main";
import type { Shift } from "@clipboard-health/contract-backend-main";
export * from "@clipboard-health/contract-home-health-api";
const flags = require("@clipboard-health/flag-backend-main");
```

### ✅ Correct

```ts
import { dateTimeSchema, objectId } from "@clipboard-health/contract-core";

// Duplicated from contract-backend-main rather than imported: Zod brands are
// structural, so this stays type-identical to the upstream schema.
export const WorkplaceIdSchema = objectId.brand("WorkplaceId");
```

## Options

None.

## When Not To Use It

Only during a migration window while an existing cross-contract dependency is being removed — disable per line with an `eslint-disable-next-line` comment referencing the removal ticket rather than turning the rule off for the package.
