/* eslint-disable @typescript-eslint/no-unused-vars */
import { type z } from "zod";

import { type paginationQuery } from "../query";

type Query = z.infer<typeof paginationQuery>;
let _queryTypeCheck: Query | undefined;
//  ^? let _queryTypeCheck: {
//         page: {
//             size: number;
//             cursor?: string | undefined;
//         };
//     } | undefined

const _validSingleField: Query = {
  page: { size: 10 },
};

const _validMultipleFields: Query = {
  page: { size: 10, cursor: "1" },
};

const _invalidField: Query = {
  // @ts-expect-error: invalid
  page: { number: 1 },
};

const _invalidApiType: Query = {
  // @ts-expect-error: invalid
  invalid: { size: 10 },
};

const _invalidFieldDataType: Query = {
  // @ts-expect-error: invalid
  page: { size: "10" },
};
/* eslint-enable @typescript-eslint/no-unused-vars */
