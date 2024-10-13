/* eslint-disable @typescript-eslint/no-unused-vars */
import { type z } from "zod";

import { type fieldsQuery } from "../query";

type Query = z.infer<typeof fieldsQuery>;
let _queryTypeCheck: Query | undefined;
//  ^? let _queryTypeCheck: {
//         fields?: {
//             user?: ("name" | "age")[] | undefined;
//             post?: "title"[] | undefined;
//         } | undefined;
//     } | undefined

const _validSingleField: Query = {
  fields: { user: ["name"] },
};

const _validMultipleFields: Query = {
  fields: { user: ["name", "age"] },
};

const _invalidField: Query = {
  // @ts-expect-error: invalid
  fields: { user: ["email"] },
};

const _invalidApiType: Query = {
  // @ts-expect-error: invalid
  fields: { post: ["name"] },
};

const _invalidFieldDataType: Query = {
  // @ts-expect-error: invalid
  fields: { user: "name" },
};
/* eslint-enable @typescript-eslint/no-unused-vars */
