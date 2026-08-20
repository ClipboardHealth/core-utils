---
description: "Returning or throwing errors: ServiceResult, ServiceError, ERROR_CODES, toError"
---

# Error Handling

- **Expected errors** (not found, validation failures): return `ServiceResult` (Either type) from `@clipboard-health/util-ts` instead of `try/catch`
- **Unexpected/unrecoverable errors**: throw `ServiceError` from `@clipboard-health/util-ts`
- Use `toError(maybeError)` from `@clipboard-health/util-ts` over hardcoded strings or type casting (`as Error`)
- `ServiceError` takes a message string or `{ issues, cause?, id?, source? }`. `code` and `message` describe a single issue and belong inside `issues`, not at the top level
- Use `ERROR_CODES` from `@clipboard-health/util-ts` for an issue's `code`, not `HttpStatus` from NestJS. The HTTP status is derived from the code (`notFound` → 404); custom code strings fall back to 500, so set the issue's `status` when you need a different one

```typescript
import {
  ERROR_CODES,
  failure,
  ServiceError,
  type ServiceResult,
  success,
  toError,
} from "@clipboard-health/util-ts";

// Expected — return
function findShift(params: { shiftId: string }): ServiceResult<Shift> {
  const { shiftId } = params;
  const shift = shiftsById.get(shiftId);

  return shift
    ? success(shift)
    : failure({ issues: [{ code: ERROR_CODES.notFound, message: `Shift ${shiftId} not found` }] });
}

// Unexpected/unrecoverable — throw
async function syncShift(params: { shiftId: string }): Promise<void> {
  const { shiftId } = params;

  try {
    await shiftClient.sync(shiftId);
  } catch (error) {
    throw new ServiceError({
      issues: [{ code: ERROR_CODES.internal, message: `Shift ${shiftId} sync failed` }],
      cause: toError(error),
    });
  }
}
```
