/* eslint-disable @typescript-eslint/no-unused-vars */
import { type z } from "zod";

import { type query } from "../query";

type Fields = z.infer<typeof query.shape.fields>;
let _typeCheck: Fields | undefined;
//  ^? let _typeCheck: {
//         article?: "title"[] | undefined;
//         user?: ("age" | "dateOfBirth")[] | undefined;
//     } | undefined

const _validSingleField: Fields = {
  user: ["dateOfBirth"],
};

const _validMultipleFields: Fields = {
  user: ["age", "dateOfBirth"],
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
