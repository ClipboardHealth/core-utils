// embedex: packages/util-ts/README.md
import { strictEqual } from "node:assert/strict";

import { commaSeparatedList } from "@clipboard-health/util-ts";

type Field = "id" | "name" | "email";

const fields = commaSeparatedList<Field>();
const selected: "id,name,id" = fields("id,name,id");

strictEqual(selected, "id,name,id");
