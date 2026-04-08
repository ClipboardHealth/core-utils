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

#### DateTime schema

`dateTimeSchema()` validates strict ISO-8601 datetime strings and transforms them to `Date` objects. Unlike `z.coerce.date()`, it rejects loose inputs like epoch numbers and date-only strings. Composable with `.optional()`, `.nullable()`, etc. at the call site.

#### Enum validation helpers

This package provides four enum validation helpers to cover different use cases:

**Fallback validation (with coalescing):**

- `requiredEnumWithFallback(values, fallback)` - Invalid values are coerced to the fallback value. `undefined` fails validation.
- `optionalEnumWithFallback(values, fallback)` - Invalid values are coerced to the fallback value. `undefined` passes through as `undefined`.

**Strict validation (no fallback):**

- `requiredEnum(values)` - Wraps `z.enum()` for required strict validation. Invalid values fail validation.
- `optionalEnum(values)` - Wraps `z.enum()` for optional strict validation. Invalid values fail validation, but `undefined` is allowed.

<embedex source="packages/contract-core/examples/schemas.ts">

```ts
import {
  apiErrors,
  booleanString,
  dateTimeSchema,
  nonEmptyString,
  optionalEnum,
  optionalEnumWithFallback,
  requiredEnum,
  requiredEnumWithFallback,
  uuid,
} from "@clipboard-health/contract-core";
import type { z, ZodError } from "zod";

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

// DateTime schema examples
// Accepts ISO-8601 datetime strings and Date objects, normalizes to Date.
// Composable with .optional(), .nullable(), etc.
const createdAt = dateTimeSchema().parse("2026-03-15T10:30:00.000Z");
// => Date object
console.log(createdAt instanceof Date); // true
console.log(createdAt.toISOString()); // "2026-03-15T10:30:00.000Z"

// Date objects pass through as-is
const fromDate = dateTimeSchema().parse(new Date("2026-03-15T10:30:00.000Z"));
// => Date object
console.log(fromDate instanceof Date); // true

try {
  dateTimeSchema().parse("2026-03-15"); // date-only string
} catch (error) {
  logError(error);
  // => Invalid datetime
}

try {
  dateTimeSchema().parse(1_773_340_050_000); // epoch number
} catch (error) {
  logError(error);
  // => Invalid union
}

// Optional usage — compose at the call site
const schema = dateTimeSchema().optional();
// eslint-disable-next-line unicorn/no-useless-undefined
const noDate = schema.parse(undefined);
// => undefined
console.log(noDate);

const someDate = schema.parse("2026-03-15T10:30:00.000Z");
// => Date object
console.log(someDate);

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
const requiredUserTypeSchema = requiredEnum(["admin", "worker", "workplace"]);
// type RequiredUserType = "admin" | "worker" | "workplace"
type RequiredUserType = z.infer<typeof requiredUserTypeSchema>;

const adminUser: RequiredUserType = requiredUserTypeSchema.parse("admin");
// => "admin"
console.log(adminUser);

try {
  requiredUserTypeSchema.parse("invalid");
} catch (error) {
  logError(error);
  // => Invalid enum value. Expected 'admin' | 'worker' | 'workplace', received 'invalid'
}

try {
  // eslint-disable-next-line unicorn/no-useless-undefined
  requiredUserTypeSchema.parse(undefined);
} catch (error) {
  logError(error);
  // => Required
}

/* -- optional strict -- */
const optionalUserTypeSchema = optionalEnum(["admin", "worker", "workplace"]);
// type OptionalUserType = "admin" | "worker" | "workplace" | undefined
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
  // => Invalid enum value. Expected 'admin' | 'worker' | 'workplace', received 'invalid'
}
```

</embedex>

## Local development commands

See [`package.json`](./package.json) `scripts` for a list of commands.
