# @clipboard-health/contract-core <!-- omit from toc -->

Shared Zod schemas for Clipboard's contracts.

## Table of contents <!-- omit from toc -->

- [Install](#install)
- [Usage](#usage)
  - [Zod schemas](#zod-schemas)
  - [Typed JSON:API error extensions](#typed-jsonapi-error-extensions)
  - [Custom error documents](#custom-error-documents)
- [Local development commands](#local-development-commands)

## Install

```bash
npm install @clipboard-health/contract-core
```

## Usage

### Typed JSON:API error extensions

`apiError` and `apiErrors` keep their existing required fields and strip undeclared members.
Opt in to `source` and typed per-error `meta` with Zod's `.extend()`. `apiErrorsWith(errorSchema)`
builds a document from that error schema, retaining the default limit of 0–100 errors. Extend the
document separately for top-level `meta`; metadata stays at the location its consumer reads.

```ts
import { apiError, apiErrorsWith, apiErrorSource } from "@clipboard-health/contract-core";
import { z } from "zod";

const stepUpErrors = apiErrorsWith(
  apiError.extend({
    source: apiErrorSource.optional(),
    meta: z.object({ stepUpMethod: z.enum(["otp", "password"]) }),
  }),
);

const documentErrors = apiErrorsWith(
  apiError.extend({
    source: apiErrorSource.optional(),
    meta: z.object({ reason: z.literal("homeHealthBookingRequired") }).optional(),
  }),
).extend({
  meta: z.object({ unmetPrerequisites: z.array(z.string()).min(1) }).optional(),
});

type StepUpErrorDocument = z.infer<typeof stepUpErrors>;
type DocumentErrorDocument = z.infer<typeof documentErrors>;
```

`apiErrorSource` declares optional string `pointer`, `parameter`, and `header` members. An empty
pointer addresses the whole document. Unknown source and metadata members are still stripped.
Required versus optional metadata, error-code narrowing, and stricter array bounds belong to the
route's schema. Use `.optional()` explicitly for optional metadata.

For example, admin uses source pointers to label invalid fields, home-health clients read
`errors[].meta.stepUpMethod`, and documents clients read `errors[].meta.reason` and top-level
`meta.unmetPrerequisites`. Ordinary routes keep using `apiErrors` without accepting these extensions.
Source extensions also accept the source objects produced by `ServiceError.toJsonApi()`; no runtime
dependency on `ServiceError` is needed. Declaring an extension does not itself install a server
renderer: that renderer must preserve the declared source and metadata instead of parsing them
through bare `apiErrors` again.

### Custom error documents

`customError({ status, body })` is an escape hatch for a consumer that needs an existing body that
cannot be represented by typed JSON:API extensions. Prefer `apiErrors` or `apiErrorsWith` otherwise.
For example, the payout-settings PATCH consumer reads a top-level `message` alongside JSON:API
errors:

```ts
import { apiErrors, customError } from "@clipboard-health/contract-core";
import { z } from "zod";

const payoutSettingsError = customError({
  status: 422,
  body: apiErrors.extend({ message: z.string() }),
});

// In an oRPC contract's error map:
const errors = { UNPROCESSABLE_CONTENT: payoutSettingsError };

// Handler error data has this envelope; it is not the HTTP response body:
const data = {
  body: { message: "Payout settings cannot be updated", errors: [] },
  headers: { "retry-after": "30" },
};
```

The returned `{ status, data }` declaration implements Standard Schema v1. Its validator checks the
`{ body, headers? }` envelope and the body schema synchronously, so body schemas can't use async
refinements; Zod throws if they do. Issue paths are relative to the input, such as
`["body", "message"]`. On success it
marks a response containing the **original body**, not Zod's parsed output: extra fields, key order,
and values survive; transforms, coercions, defaults, and stripping are not applied to that body.
This is deliberately not a sanitizing parser. Only put caller-safe data in the original body and
trusted, string-valued response headers in `headers`. Status validation remains the transport's
responsibility, matching backend-main's existing helper.

Server and documentation adapters use the package-root readers:

- `getCustomErrorResponse({ data })` returns `{ body, headers? }` only for a marked, validated
  response; ordinary `{ body }` data is not recognized. Render this body with the declared HTTP
  status only after the transport has classified the error as declared and valid. Do not send
  undeclared or invalid errors through this escape hatch.
- `getCustomErrorBodySchema({ schema })` returns the original Zod body schema for a custom
  declaration's `data`, so an OpenAPI generator documents the actual HTTP body rather than the
  transport envelope. Other schemas return `undefined`.

Both readers use the versioned `Symbol.for("@clipboard-health/contract-core/custom-error/v1")`
protocol, with `"schema"` and `"response"` brands, rather than class identity. Recognition and repeated
validation work across duplicate package instances and the CommonJS and ESM builds in one JavaScript
realm. The symbol is an in-process interoperability marker, not an authentication boundary; serialized
JSON is not a marked response. Backend-main can re-export these three helpers without changing
their signatures.

The brand is set at runtime only. Public types are the exported `CustomErrorDeclaration`,
`CustomErrorBodySchema`, `CustomErrorResponse`, and `CustomErrorDocument` interfaces, so a
consumer can emit declarations for an exported contract that uses `customError`.

These APIs are tested with Zod 3.25.76, not Zod 4; other Zod versions are not covered by this
validation suite. The existing Zod 3 peer range is unchanged. The package root has no Node.js,
Nest, Express, or oRPC runtime imports; `@standard-schema/spec` is imported only as a type.

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

#### Discriminated union with fallback

`discriminatedUnionWithFallback(discriminator, variants)` takes the same arguments as `z.discriminatedUnion` and returns a response schema for a union whose variant set grows over time, so reads tolerate variants this consumer does not know yet.

It is for responses only. Requests declare their own `z.discriminatedUnion` over the same variants, where an unknown variant is a client error rather than something to tolerate.

|                                          | `z.discriminatedUnion` (requests) | `discriminatedUnionWithFallback` (responses) |
| ---------------------------------------- | --------------------------------- | -------------------------------------------- |
| Unknown discriminator                    | reject                            | collapse to fallback                         |
| Unknown top-level key on a known variant | strip                             | strip                                        |
| Missing field, invalid value             | reject                            | reject                                       |

`z.union` cannot express this. Its fallback branch matches any unknown value, so a known variant with a bad field fails every branch and reports an opaque `invalid_union` carrying one nested error per branch. Rewriting the unknown discriminator first means the response discriminates normally and reports the issue on the offending field alone, which is what makes a rejected response diagnosable from logs.

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
  discriminatedUnionWithFallback,
  ENUM_FALLBACK,
  nonEmptyString,
  objectId,
  optionalEnum,
  optionalEnumWithFallback,
  requiredEnum,
  requiredEnumWithFallback,
  uuid,
} from "@clipboard-health/contract-core";
import { z, type ZodError } from "zod";

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

const noUserType = optionalUserTypeSchema.parse(undefined);
// => undefined
console.log(noUserType);

try {
  optionalUserTypeSchema.parse("invalid");
} catch (error) {
  logError(error);
  // => Invalid enum value. Expected 'admin' | 'worker' | 'workplace', received 'invalid'
}

// Discriminated union with fallback examples
// Takes the same arguments as z.discriminatedUnion and returns a response schema
// that tolerates variants this consumer does not know yet.
const notificationVariants = [
  z.object({
    channel: z.literal("EMAIL"),
    emailAddress: z.string().email(),
  }),
  z.object({
    channel: z.literal("SMS"),
    phoneNumber: nonEmptyString,
  }),
] as const;

const notificationResponseSchema = discriminatedUnionWithFallback("channel", notificationVariants);

const emailNotification = notificationResponseSchema.parse({
  channel: "EMAIL",
  emailAddress: "worker@example.com",
});
// => { channel: "EMAIL", emailAddress: "worker@example.com" }
console.log(emailNotification);

// A variant this consumer does not recognize yet collapses to ENUM_FALLBACK.
const unrecognizedNotification = notificationResponseSchema.parse({
  channel: "PUSH",
  deviceToken: "abc123",
});
// => { channel: "UNRECOGNIZED_" }
console.log(unrecognizedNotification);

// A known variant with a bad field still fails, naming the field.
try {
  notificationResponseSchema.parse({ channel: "EMAIL", emailAddress: 3 });
} catch (error) {
  logError(error);
  // => Expected string, received number
}

// Requests use z.discriminatedUnion directly: an unknown variant is a client
// error, not something to tolerate.
const notificationRequestSchema = z.discriminatedUnion("channel", [...notificationVariants]);

try {
  notificationRequestSchema.parse({ channel: "PUSH", deviceToken: "abc123" });
} catch (error) {
  logError(error);
  // => Invalid discriminator value. Expected 'EMAIL' | 'SMS'
}
```

</embedex>

## Local development commands

See [`package.json`](./package.json) `scripts` for a list of commands.
