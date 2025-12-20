// embedex: packages/contract-core/README.md
import {
  apiErrors,
  booleanString,
  nonEmptyString,
  optionalEnumWithFallback,
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
// => "completed"
console.log(failedStatus);

const extraStatus = optionalStatusEnumSchema.parse("extra");
// => "unspecified"
console.log(extraStatus);

// eslint-disable-next-line unicorn/no-useless-undefined
const undefinedStatus = optionalStatusEnumSchema.parse(undefined);
// => undefined
console.log(undefinedStatus);
