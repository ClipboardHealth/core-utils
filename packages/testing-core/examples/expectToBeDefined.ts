// packages/testing-core/README.md
import { ok } from "node:assert/strict";

import { expectToBeDefined } from "@clipboard-health/testing-core";

function getValue(): string | undefined {
  return "hi";
}

const value = getValue();
expectToBeDefined(value);

// Narrowed to `string`
const { length } = value;
ok(length === 2);
