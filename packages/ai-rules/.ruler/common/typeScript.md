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
- Use `date-fns` for date/time manipulation and `@clipboard-health/date-time` for formatting

## Null/Undefined Checks

Use `isDefined` helper from `@clipboard-health/util-ts`:

```typescript
// Bad: truthy check fails for 0, "", false
if (shiftId && facilityId) {
}
// Bad: use utility instead
if (shift === null) {
}
if (facility === undefined) {
}

// Good: explicit defined check
if (isDefined(shiftId) && isDefined(facilityId)) {
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
