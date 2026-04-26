// embedex: packages/contract-core/README.md
import {
  apiErrors,
  booleanString,
  commaSeparatedArray,
  dateTimeSchema,
  ENUM_FALLBACK,
  type MongoObjectId,
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

// ObjectId: 24-char hex; TypeScript infers branded MongoObjectId (runtime value is still a string)
const facilityId: MongoObjectId = objectId.parse("507f1f77bcf86cd799439011");
console.log(facilityId);

const idList = commaSeparatedArray(objectId).parse(
  "507f1f77bcf86cd799439011,507f191e810c19729de860ea",
);
// => MongoObjectId[] (two ids)
console.log(idList.length);

// eslint-disable-next-line unicorn/no-useless-undefined
const noSingleId = objectId.optional().parse(undefined);
console.log(noSingleId); // => undefined

try {
  objectId.parse("507f1f77bcf86cd79943901"); // too short
} catch (error) {
  logError(error);
  // => Must be a valid ObjectId
}

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
