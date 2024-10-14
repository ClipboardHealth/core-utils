/* eslint-disable @typescript-eslint/no-unused-vars */
import { type z } from "zod";

import { type sortQuery } from "../query";

type Query = z.infer<typeof sortQuery>;
let _queryTypeCheck: Query;
//  ^? let _queryTypeCheck: {
//         sort?: ("age" | "name" | "-age" | "-name")[] | undefined;
//     }

const _validSingleSort: Query = {
  sort: ["age"],
};

const _validMultipleSort: Query = {
  sort: ["-age", "name"],
};

const _invalidSortField: Query = {
  // @ts-expect-error: invalid
  sort: ["invalid"],
};

const _invalidSortDataType: Query = {
  // @ts-expect-error: invalid
  sort: "name",
};
/* eslint-enable @typescript-eslint/no-unused-vars */
