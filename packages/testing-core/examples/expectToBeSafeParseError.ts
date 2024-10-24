import { ok } from "node:assert/strict";

import { expectToBeSafeParseError } from "@clipboard-health/testing-core";
import { z } from "zod";

const schema = z.object({ name: z.string() });

const value = schema.safeParse({ name: 1 });
expectToBeSafeParseError(value);

// Narrowed to `SafeParseError`
ok(value.error.issues[0]!.message === "Expected string, received number");
