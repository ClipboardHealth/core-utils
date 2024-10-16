/* eslint-disable @typescript-eslint/no-unused-vars */
import { type z } from "zod";

import { type query } from "../query";

type Sort = z.infer<typeof query.shape.sort>;
let _typeCheck: Sort;
//  ^? let _typeCheck: ("age" | "dateOfBirth" | "-age" | "-dateOfBirth")[] | undefined

const _validSingleSort: Sort = ["age"];

const _validMultipleSort: Sort = ["-age", "dateOfBirth"];

// @ts-expect-error: invalid
const _invalidSortField: Sort = ["invalid"];

// @ts-expect-error: invalid
const _invalidSortDataType: Sort = "name";
/* eslint-enable @typescript-eslint/no-unused-vars */
