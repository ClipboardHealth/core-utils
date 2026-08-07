---
description: "Returning or throwing errors: ServiceResult, ServiceError, ERROR_CODES, toError"
---

# Error Handling

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
