# TypeScript

## Naming Conventions

- Avoid acronyms and abbreviations; for those widely known, use camelCase: `httpRequest`, `gpsPosition`, `cliArguments`, `apiResponse`
- File-scoped constants: `MAX_RETRY_COUNT`
- Instead of `agentRequirement`, `agentReq`, `workerType`, use `qualification`
- Instead of `agent`, `hcp`, `healthcareProvider`, use `worker`
- Instead of `facility`, `hcf`, `healthcareFacility`, use `workplace`

## Core Rules

- Strict-mode TypeScript
- Avoid type assertions (`as`, `!`) unless absolutely necessary
- Use `function` keyword for declarations, not `const`
- Prefer `undefined` over `null`
- Files read top-to-bottom: exports first, internal helpers below
- Boolean props: `is*`, `has*`, `should*`, `can*`
- Use const assertions for constants: `as const`
- Use immutable array methods (`toSorted`, `toReversed`) instead of mutating methods (`sort`, `reverse`)
- Return Prisma decimal values as strings in API responses to avoid floating-point precision issues
- Use explicit access modifiers (`public`, `private`, `protected`) on all class methods and properties
- Use a `for` loop with `// eslint-disable-next-line no-await-in-loop` for intentional sequential execution

## Null/Undefined Checks

Use `isDefined` helper from `@clipboard-health/util-ts` for `null` and `undefined` checks:

```typescript
// Bad: truthy check fails for 0, "", false
if (shiftId && workplaceId) {
}
// Bad: use utility instead
if (shift === null) {
}
if (workplace === undefined) {
}

// Good: explicit defined check
if (isDefined(shiftId) && isDefined(workplaceId)) {
}
```

## Types

```typescript
// Quantity values—always unambiguous
const money = { amountInMinorUnits: 500, currencyCode: "USD" };
const durationMinutes = 30;
```

## Functions

```typescript
// Object arguments with interfaces
interface CreateUserRequest {
  email: string;
  name?: string;
}

function createUser(request: CreateUserRequest): User {
  const { email, name } = request; // Destructure inside
  // ...
}

// Guard clauses for early returns; happy path last
function processOrder(order: Order): Result {
  if (!order.isValid) {
    return { error: "Invalid order" };
  }
  // Main logic
}
```

## Error Handling

- Favor `Either` type (`ServiceResult` from `@clipboard-health/util-ts`) for expected errors over `try/catch`
- Use `toError(maybeError)` from `@clipboard-health/util-ts` over hardcoded strings or type casting (`as Error`)
- Use `ERROR_CODES` from `@clipboard-health/util-ts`, not `HttpStatus` from NestJS

```typescript
import { ServiceError } from "@clipboard-health/util-ts";

throw new ServiceError({
  code: "SHIFT_NOT_FOUND",
  message: `Shift ${shiftId} not found`,
  httpStatus: ERROR_CODES.notFound,
});
```

## Date & Time

- Use `@clipboard-health/date-time` for all user-facing date formatting and all timezone-dependent operations (start-of-day-in-timezone, business hours, `setHours`, etc.) with an explicit `timeZone` parameter
- Use `date-fns` only for timezone-agnostic timestamp math and parsing
- Never import `date-fns-tz`, `@date-fns/tz`, `moment`, or `moment-timezone`

## Internal Libraries

- Use object arguments and object return types in library APIs; wrap exported responses in `ServiceResult`; return errors via `ServiceResult` instead of throwing in core logic
- Library API types must not contain `any`, `unknown`, or `object`; use TypeScript generics; define the public API exclusively through `src/index.ts` exports; place non-public code in `internal/`
- Strive for 100% test coverage in library code (`/* istanbul ignore next */` only for genuinely untestable lines)
- When wrapping another library, design the API from first principles for our use cases; do not mirror the wrapped library's API or leak implementation details through interface names

## Rules Engine

- Do not mutate instance or static variables inside `@clipboard-health/rules-engine` rule functions
- Do not perform side effects (DB writes, variable mutation) inside rules — pull side effects up to the caller
