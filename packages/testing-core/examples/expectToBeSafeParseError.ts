// packages/testing-core/README.md
import { equal } from "node:assert/strict";

import { expectToBeDefined, expectToBeSafeParseError } from "@clipboard-health/testing-core";
import { z } from "zod";

const schema = z.object({ name: z.string() });

const value = schema.safeParse({ name: 1 });
expectToBeSafeParseError(value);

// Narrowed to `SafeParseError`
const firstIssue = value.error.issues[0];
expectToBeDefined(firstIssue);

// Narrowed to `ZodIssue`
equal(firstIssue.message, "Expected string, received number");
