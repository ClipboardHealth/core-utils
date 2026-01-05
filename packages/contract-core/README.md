# @clipboard-health/contract-core <!-- omit from toc -->

Shared Zod schemas for Clipboard's contracts.

## Table of contents <!-- omit from toc -->

- [Install](#install)
- [Usage](#usage)
  - [Zod schemas](#zod-schemas)
- [Local development commands](#local-development-commands)

## Install

```bash
npm install @clipboard-health/contract-core
```

## Usage

### Zod schemas

#### Enum validation helpers

This package provides four enum validation helpers to cover different use cases:

**Strict validation (no fallback):**

- `requiredEnum(values)` - Wraps `z.enum()` for required strict validation. Invalid values fail validation.
- `optionalEnum(values)` - Wraps `z.enum()` for optional strict validation. Invalid values fail validation, but `undefined` is allowed.

Use strict validation when:

- User types and authentication scenarios where invalid values should fail validation
- Critical business logic where coalescing could hide data quality issues
- API contract validation where all parties should use current enum values
- Strict validation is required without fallback behavior

**Fallback validation (with coalescing):**

- `requiredEnumWithFallback(values, fallback)` - Invalid values are coerced to the fallback value. `undefined` fails validation.
- `optionalEnumWithFallback(values, fallback)` - Invalid values are coerced to the fallback value. `undefined` passes through as `undefined`.

Use fallback validation when:

- Parsing data from external sources that may have evolved over time
- Handling legacy data with deprecated enum values
- Scenarios where graceful degradation is acceptable
- Backwards compatibility is required

<embedex source="packages/contract-core/examples/schemas.ts">

```ts
import {
  apiErrors,
  booleanString,
  nonEmptyString,
  optionalEnum,
  optionalEnumWithFallback,
  requiredEnum,
  requiredEnumWithFallback,
  uuid,
} from "@clipboard-health/contract-core";
import { type z, type ZodError } from "zod";

function logError(error: unknown) {
  console.error((error as ZodError).issues[0]!.message);
}

apiErrors.parse({
  errors: [
    {
      code: "NotFound",
      detail: "Resource 'b146a790-9ed1-499f-966d-6c4905dc667f' not found",
      id: "6191a8a0-96ff-4d4b-8e0f-746a5ab215f9",
      status: "404",
      title: "Not Found",
    },
  ],
});

booleanString.parse("true");

try {
  booleanString.parse("invalid");
} catch (error) {
  logError(error);
  // => Invalid enum value. Expected 'true' | 'false', received 'invalid'
}

nonEmptyString.parse("hello");
try {
  nonEmptyString.parse("");
} catch (error) {
  logError(error);
  // => String must contain at least 1 character(s)
}

// UUID validation examples
uuid.parse("b8d617bb-edef-4262-a6e3-6cc807fa1b26");
try {
  uuid.parse("invalid");
} catch (error) {
  logError(error);
  // => Invalid UUID format
}

// Enum with fallback examples
/* -- required -- */
const requiredStatusEnumSchema = requiredEnumWithFallback(
  ["unspecified", "pending", "completed", "failed"],
  "unspecified",
);
// type RequiredStatusEnum = "unspecified" | "pending" | "completed" | "failed"
type RequiredStatusEnum = z.infer<typeof requiredStatusEnumSchema>;

const completedStatus: RequiredStatusEnum = requiredStatusEnumSchema.parse("completed");
// => "completed"
console.log(completedStatus);

const additionalStatus = requiredStatusEnumSchema.parse("additional");
// => "unspecified"
console.log(additionalStatus);

try {
  // eslint-disable-next-line unicorn/no-useless-undefined
  requiredStatusEnumSchema.parse(undefined);
} catch (error) {
  logError(error);
  // => Validation error
}

/* -- optional -- */
const optionalStatusEnumSchema = optionalEnumWithFallback(
  ["unspecified", "pending", "completed", "failed"],
  "unspecified",
);
// type OptionalStatusEnum = "unspecified" | "pending" | "completed" | "failed" | undefined
type OptionalStatusEnum = z.infer<typeof optionalStatusEnumSchema>;

const failedStatus: OptionalStatusEnum = optionalStatusEnumSchema.parse("failed");
// => "failed"
console.log(failedStatus);

const extraStatus = optionalStatusEnumSchema.parse("extra");
// => "unspecified"
console.log(extraStatus);

// eslint-disable-next-line unicorn/no-useless-undefined
const undefinedStatus = optionalStatusEnumSchema.parse(undefined);
// => undefined
console.log(undefinedStatus);

// Strict enum examples (no fallback behavior)
// Use these when invalid values should fail validation rather than being coerced.
// Ideal for user types, authentication, and critical business logic.

/* -- required strict -- */
const requiredUserTypeSchema = requiredEnum(["admin", "worker", "facility"]);
// type RequiredUserType = "admin" | "worker" | "facility"
type RequiredUserType = z.infer<typeof requiredUserTypeSchema>;

const adminUser: RequiredUserType = requiredUserTypeSchema.parse("admin");
// => "admin"
console.log(adminUser);

try {
  requiredUserTypeSchema.parse("invalid");
} catch (error) {
  logError(error);
  // => Invalid enum value. Expected 'admin' | 'worker' | 'facility', received 'invalid'
}

try {
  // eslint-disable-next-line unicorn/no-useless-undefined
  requiredUserTypeSchema.parse(undefined);
} catch (error) {
  logError(error);
  // => Required
}

/* -- optional strict -- */
const optionalUserTypeSchema = optionalEnum(["admin", "worker", "facility"]);
// type OptionalUserType = "admin" | "worker" | "facility" | undefined
type OptionalUserType = z.infer<typeof optionalUserTypeSchema>;

const workerUser: OptionalUserType = optionalUserTypeSchema.parse("worker");
// => "worker"
console.log(workerUser);

// eslint-disable-next-line unicorn/no-useless-undefined
const noUserType = optionalUserTypeSchema.parse(undefined);
// => undefined
console.log(noUserType);

try {
  optionalUserTypeSchema.parse("invalid");
} catch (error) {
  logError(error);
  // => Invalid enum value. Expected 'admin' | 'worker' | 'facility', received 'invalid'
}
```

</embedex>

## Local development commands

See [`package.json`](./package.json) `scripts` for a list of commands.
