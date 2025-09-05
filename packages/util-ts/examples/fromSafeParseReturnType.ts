// packages/util-ts/src/lib/functional/serviceResult.ts,packages/util-ts/README.md
import { equal, ok } from "node:assert/strict";

import { either as E, fromSafeParseReturnType } from "@clipboard-health/util-ts";
import { z } from "zod";

const schema = z.object({ name: z.string(), age: z.number() });

const validData = { name: "John", age: 30 };
const successResult = fromSafeParseReturnType(schema.safeParse(validData));

ok(E.isRight(successResult));
equal(successResult.right.name, "John");

const invalidData = { name: "John", age: "thirty" };
const failureResult = fromSafeParseReturnType(schema.safeParse(invalidData));

ok(E.isLeft(failureResult));
ok(failureResult.left.issues.length > 0);
