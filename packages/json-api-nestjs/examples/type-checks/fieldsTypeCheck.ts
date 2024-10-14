/* eslint-disable @typescript-eslint/no-unused-vars */
import { type z } from "zod";

import { type query } from "../query";

type Fields = z.infer<typeof query.shape.fields>;
let _typeCheck: Fields | undefined;
//  ^? let _typeCheck: {
//         user?: ("age" | "name")[] | undefined;
//         article?: "title"[] | undefined;
//     } | undefined

const _validSingleField: Fields = {
  user: ["name"],
};

const _validMultipleFields: Fields = {
  user: ["age", "name"],
};

const _invalidField: Fields = {
  // @ts-expect-error: invalid
  user: ["email"],
};

const _invalidApiType: Fields = {
  // @ts-expect-error: invalid
  invalid: ["name"],
};

const _invalidFieldDataType: Fields = {
  // @ts-expect-error: invalid
  user: "name",
};
/* eslint-enable @typescript-eslint/no-unused-vars */
