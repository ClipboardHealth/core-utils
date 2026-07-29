---
description: "Writing ANY TypeScript code"
---

# TypeScript

## Domain Language

- Use `worker`, not `agent`, `hcp`, or `healthcareProvider`
- Use `workplace`, not `facility`, `hcf`, or `healthcareFacility`
- Use `qualification`, not `agentRequirement`, `agentReq`, or `workerType`

## Naming Conventions

- Avoid acronyms and abbreviations; for those widely known, use camelCase: `httpRequest`, `gpsPosition`, `cliArguments`, `apiResponse`
- File-scoped constants: `MAX_RETRY_COUNT`

## Core Rules

- Do not add ticket or issue numbers (e.g. Linear, Jira IDs) to code, variable names, or comments unless explicitly asked
- Avoid type assertions (`as`, `!`) unless absolutely necessary
- Use `function` keyword for declarations, not `const`
- Prefer `undefined` over `null`
- Use `const` objects instead of `enum`s; enums are a non-type-level extension to JavaScript and require explicit mapping
- Files read top-to-bottom: exports first, internal helpers below
- Use immutable array methods (`toSorted`, `toReversed`) instead of mutating methods (`sort`, `reverse`)
- Return Prisma decimal values as strings in API responses to avoid floating-point precision issues
- Use explicit access modifiers (`public`, `private`, `protected`) on all class methods and properties
- Use a `for` loop with `// eslint-disable-next-line no-await-in-loop` for intentional sequential execution (e.g., rate limiting, ordered processing, or resource constraints); prefer `Promise.all` when operations are independent
- Functions take a single object argument typed by an interface and destructure it inside the function body
- Make quantity values unambiguous: `{ amountInMinorUnits: 500, currencyCode: "USD" }`, `durationMinutes: 30`

## Dead Code Cleanup

When removing a usage of a function, constant, type, or other symbol, check whether it has any remaining usages (e.g., search the codebase). If it has no other usages, delete the now-unused code. Apply this recursively: if deleting that code removes the last usage of another symbol, delete that symbol too. This includes removing any imports that become unused as a result.

## Null/Undefined Checks

In TypeScript code that has access to `@clipboard-health/util-ts`, prefer the named helpers over raw null/undefined comparisons:

- Replace `x === undefined`, `x === null`, `!isDefined(x)`, or `!x` (when used as a presence check) with `isNil(x)`.
- Replace `x !== undefined`, `x !== null`, `!isNil(x)`, or `x` (as a truthy presence check) with `isDefined(x)`.

Import from `@clipboard-health/util-ts`.
