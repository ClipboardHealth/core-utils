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

#### Comma-separated array schema

`commaSeparatedArray(itemSchema)` validates comma-separated string or array inputs and normalizes them to typed arrays. Designed for shared contracts where the server receives comma-separated query strings and the client passes typed arrays.

```ts
// z.input  → string | string[]
// z.output → string[]
commaSeparatedArray(nonEmptyString).optional();

// z.input  → string | ("CNA" | "RN" | "LVN")[]
// z.output → ("CNA" | "RN" | "LVN")[]
commaSeparatedArray(requiredEnum(["CNA", "RN", "LVN"]));

// z.input  → string | string[]
// z.output → string[]  (each validated as ObjectId)
commaSeparatedArray(objectId);

// z.input  → string | (string | Date)[]
// z.output → Date[]
commaSeparatedArray(dateTimeSchema());
```

Composes with all contract-core schemas and enum helpers. Replaces `z.preprocess(splitString, z.array(...))` with proper `z.input` typing (the `splitString` pattern erases input types to `unknown`).

#### DateTime schema

`dateTimeSchema()` validates strict ISO-8601 datetime strings and transforms them to `Date` objects. Unlike `z.coerce.date()`, it rejects loose inputs like epoch numbers and date-only strings. Composable with `.optional()`, `.nullable()`, etc. at the call site.

#### Enum validation helpers

This package provides four enum validation helpers to cover different use cases:

**Fallback validation (with coalescing):**

- `requiredEnumWithFallback(values)` - Invalid values are coerced to `ENUM_FALLBACK` (`"UNRECOGNIZED_"`), a business-context-neutral sentinel automatically appended to the enum type. `undefined` fails validation.
- `optionalEnumWithFallback(values)` - Invalid values are coerced to `ENUM_FALLBACK` (`"UNRECOGNIZED_"`). `undefined` passes through as `undefined`.

**Strict validation (no fallback):**

- `requiredEnum(values)` - Wraps `z.enum()` for required strict validation. Invalid values fail validation.
- `optionalEnum(values)` - Wraps `z.enum()` for optional strict validation. Invalid values fail validation, but `undefined` is allowed.

**Type narrowing:** All helpers reject widened `string[]` arrays at compile time. When passing a pre-declared variable, use `as const` to preserve literal types:

```ts
// Inline arrays work as-is
requiredEnum(["a", "b"]);

// Pre-declared variables require `as const`
const VALUES = ["a", "b"] as const;
requiredEnum(VALUES);

// Without `as const`, the type widens to string[] and is rejected
const widened = ["a", "b"];
requiredEnum(widened); // TS error
```

<embedex source="packages/contract-core/examples/schemas.ts">

```ts
import {
  apiErrors,
  booleanString,
  commaSeparatedArray,
  dateTimeSchema,
  ENUM_FALLBACK,
  nonEmptyString,
  objectId,
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

// Comma-separated array examples
// Designed for shared contracts: server receives "CNA,RN" (string), client passes ["CNA", "RN"] (array).
// Both normalize to the same typed array output.
const workerTypes = commaSeparatedArray(requiredEnum(["CNA", "RN", "LVN"]));

// Server-side: comma-separated string from query params
const fromString = workerTypes.parse("CNA,RN");
// => ["CNA", "RN"]
console.log(fromString);

// Client-side: typed array
const fromArray = workerTypes.parse(["CNA", "LVN"]);
// => ["CNA", "LVN"]
console.log(fromArray);

// Composes with other schemas
const workerIds = commaSeparatedArray(objectId).optional();
const dates = commaSeparatedArray(dateTimeSchema());

// Works with .optional()
// eslint-disable-next-line unicorn/no-useless-undefined
const noIds = workerIds.parse(undefined);
// => undefined
console.log(noIds);

const someDates = dates.parse("2026-01-01T00:00:00.000Z,2026-01-02T00:00:00.000Z");
// => [Date, Date]
console.log(someDates[0] instanceof Date); // true

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
// ENUM_FALLBACK is a neutral sentinel ("UNRECOGNIZED_") automatically appended
// to the enum type. Consumers cannot choose their own fallback value, preventing
// misuse where a business-meaningful value is treated as a default.

/* -- required -- */
const requiredStatusEnumSchema = requiredEnumWithFallback(["pending", "completed", "failed"]);
// type RequiredStatusEnum = "pending" | "completed" | "failed" | "UNRECOGNIZED_"
type RequiredStatusEnum = z.infer<typeof requiredStatusEnumSchema>;

const completedStatus: RequiredStatusEnum = requiredStatusEnumSchema.parse("completed");
// => "completed"
console.log(completedStatus);

const additionalStatus = requiredStatusEnumSchema.parse("additional");
// => "UNRECOGNIZED_" (ENUM_FALLBACK)
console.log(additionalStatus);
console.log(additionalStatus === ENUM_FALLBACK); // true

try {
  // eslint-disable-next-line unicorn/no-useless-undefined
  requiredStatusEnumSchema.parse(undefined);
} catch (error) {
  logError(error);
  // => Validation error
}

/* -- optional -- */
const optionalStatusEnumSchema = optionalEnumWithFallback(["pending", "completed", "failed"]);
// type OptionalStatusEnum = "pending" | "completed" | "failed" | "UNRECOGNIZED_" | undefined
type OptionalStatusEnum = z.infer<typeof optionalStatusEnumSchema>;

const failedStatus: OptionalStatusEnum = optionalStatusEnumSchema.parse("failed");
// => "failed"
console.log(failedStatus);

const extraStatus = optionalStatusEnumSchema.parse("extra");
// => "UNRECOGNIZED_" (ENUM_FALLBACK)
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
