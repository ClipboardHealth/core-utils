import { type z } from "zod";

import { type query } from "../query";

type Page = z.infer<typeof query.shape.page>;
let _typeCheck: Page | undefined;
//  ^? let _typeCheck: {
//         size: number;
//         cursor?: string | undefined;
//     } | undefined

const _validSingleField: Page = {
  size: 10,
};

const _validMultipleFields: Page = {
  cursor: "1",
  size: 10,
};

const _invalidField: Page = {
  // @ts-expect-error: invalid
  number: 1,
};

const _invalidKey: Page = {
  // @ts-expect-error: invalid
  invalid: 10,
};

const _invalidFieldDataType: Page = {
  // @ts-expect-error: invalid
  size: "10",
};
