// packages/util-ts/src/lib/functional/serviceResult.ts,packages/util-ts/README.md
import { ok, strictEqual } from "node:assert/strict";

import { fromSafeParseReturnType, isFailure, isSuccess } from "@clipboard-health/util-ts";
import { z } from "zod";

const schema = z.object({ name: z.string(), age: z.number() });

const validData = { name: "John", age: 30 };
const successResult = fromSafeParseReturnType(schema.safeParse(validData));

ok(isSuccess(successResult));
strictEqual(successResult.right.name, "John");

const invalidData = { name: "John", age: "thirty" };
const failureResult = fromSafeParseReturnType(schema.safeParse(invalidData));

ok(isFailure(failureResult));
ok(failureResult.left.issues.length > 0);
