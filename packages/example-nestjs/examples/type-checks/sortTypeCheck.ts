import { type z } from "zod";

import { type query } from "../query";

type Sort = z.infer<typeof query.shape.sort>;
// @ts-expect-error: unused
let _typeCheck: Sort | undefined;
//  ^? let _typeCheck: ("age" | "dateOfBirth" | "-age" | "-dateOfBirth")[] | undefined

// @ts-expect-error: unused
const _validSingleSort: Sort = ["age"];

// @ts-expect-error: unused
const _validMultipleSort: Sort = ["-age", "dateOfBirth"];

// @ts-expect-error: invalid
const _invalidSortField: Sort = ["invalid"];

// @ts-expect-error: invalid
const _invalidSortDataType: Sort = "age";
