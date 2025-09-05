// packages/testing-core/README.md
import { equal } from "node:assert/strict";

import { expectToBeSafeParseSuccess } from "@clipboard-health/testing-core";
import { z } from "zod";

const schema = z.object({ name: z.string() });

const value = schema.safeParse({ name: "hi" });
expectToBeSafeParseSuccess(value);

// Narrowed to `SafeParseSuccess`
equal(value.data.name, "hi");
