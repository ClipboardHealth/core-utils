/* eslint-disable @typescript-eslint/no-unused-vars */
import { type z } from "zod";

import { type includeQuery } from "../query";

type Query = z.infer<typeof includeQuery>;
let _queryTypeCheck: Query;
//  ^? let _queryTypeCheck: {
//         include?: ("articles" | "articles.comments")[] | undefined;
//     }

const _validSingleInclude: Query = {
  include: ["articles"],
};

const _validMultipleInclude: Query = {
  include: ["articles", "articles.comments"],
};

const _invalidIncludeField: Query = {
  // @ts-expect-error: invalid
  include: ["invalid"],
};

const _invalidIncludeDataType: Query = {
  // @ts-expect-error: invalid
  include: "articles",
};
/* eslint-enable @typescript-eslint/no-unused-vars */
