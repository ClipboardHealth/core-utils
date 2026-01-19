# Error Handling

## Service Errors

```typescript
import { ServiceError } from "@clipboard-health/util-ts";

throw new ServiceError({
  code: "SHIFT_NOT_FOUND",
  message: `Shift ${shiftId} not found`,
  httpStatus: 404,
});
```

- Favor `Either` type for expected errors over `try/catch`
- Guard clauses for preconditions
- Early returns for error conditions
- Happy path last

## Controller Translation

```typescript
@UseFilters(HttpExceptionFilter)
@Controller("shifts")
export class ShiftController {}
```

## Background Job Errors

```typescript
async perform(payload: JobPayload): Promise<string> {
  try {
    // Main logic
  } catch (error) {
    if (error instanceof RecoverableError) throw error;  // Retry
    return `Skipping: ${error.message}`;  // No retry
  }
}
```
