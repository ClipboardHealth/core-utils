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

- Avoid type assertions (`as`, `!`) unless absolutely necessary
- Use `function` keyword for declarations, not `const`
- Prefer `undefined` over `null`
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

- Replace `x === undefined`, `x === null`, or `!x` (when used as a presence check) with `isNil(x)`.
- Replace `x !== undefined`, `x !== null`, or `x` (as a truthy presence check) with `isDefined(x)`.

Import from `@clipboard-health/util-ts`.

## Error Handling

- **Expected errors** (not found, validation failures): return `ServiceResult` (Either type) from `@clipboard-health/util-ts` instead of `try/catch`
- **Unexpected/unrecoverable errors**: throw `ServiceError` from `@clipboard-health/util-ts`
- Use `toError(maybeError)` from `@clipboard-health/util-ts` over hardcoded strings or type casting (`as Error`)
- Use `ERROR_CODES` from `@clipboard-health/util-ts`, not `HttpStatus` from NestJS

```typescript
import { ServiceError, ERROR_CODES } from "@clipboard-health/util-ts";

// Unexpected/unrecoverable — throw
throw new ServiceError({
  code: "SHIFT_NOT_FOUND",
  message: `Shift ${shiftId} not found`,
  httpStatus: ERROR_CODES.notFound,
});
```

## Date & Time

- Use `@clipboard-health/date-time` for all user-facing date formatting and all timezone-dependent operations (start-of-day-in-timezone, business hours, `setHours`, etc.) with an explicit `timeZone` parameter
- Use `date-fns` only for timezone-agnostic timestamp math and parsing
- Use `date-fns` comparison functions (`isBefore`, `isAfter`, `isEqual`, `isSameDay`, `compareAsc`, `compareDesc`) for all date comparisons — never use raw JS comparison operators (`>`, `<`, `===`, `>=`, `<=`) or `.getTime()` for equality/inequality checks
- Never import `date-fns-tz`, `@date-fns/tz`, `moment`, or `moment-timezone`

## Rules Engine

- Do not mutate instance or static variables inside `@clipboard-health/rules-engine` rule functions
- Do not perform side effects (DB writes, variable mutation) inside rules — pull side effects up to the caller
