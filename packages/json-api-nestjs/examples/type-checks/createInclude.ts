/* eslint-disable @typescript-eslint/no-unused-vars */
import { type z } from "zod";

import { type query } from "../query";

type Include = z.infer<typeof query.shape.include>;
let _typeCheck: Include | undefined;
//  ^? let _typeCheck: ("articles" | "articles.comments")[] | undefined

const _validSingleInclude: Include = ["articles"];

const _validMultipleIncludes: Include = ["articles", "articles.comments"];

// @ts-expect-error: invalid
const _invalidIncludeField: Include = ["invalid"];

// @ts-expect-error: invalid
const _invalidIncludeDataType: Include = "articles";
/* eslint-enable @typescript-eslint/no-unused-vars */
