import { type z } from "zod";

import { type query } from "../query";

type Fields = z.infer<typeof query.shape.fields>;
// @ts-expect-error: unused
let _typeCheck: Fields | undefined;
//  ^? let _typeCheck: {
//         article?: "title"[] | undefined;
//         user?: ("age" | "dateOfBirth")[] | undefined;
//     } | undefined

// @ts-expect-error: unused
const _validSingleField: Fields = {
  user: ["dateOfBirth"],
};

// @ts-expect-error: unused
const _validMultipleFields: Fields = {
  user: ["age", "dateOfBirth"],
};

// @ts-expect-error: unused
const _invalidField: Fields = {
  // @ts-expect-error: invalid
  user: ["email"],
};

// @ts-expect-error: unused
const _invalidApiType: Fields = {
  // @ts-expect-error: invalid
  invalid: ["age"],
};

// @ts-expect-error: unused
const _invalidFieldDataType: Fields = {
  // @ts-expect-error: invalid
  user: "age",
};
