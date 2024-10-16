/* eslint-disable @typescript-eslint/no-unused-vars */
import { type z } from "zod";

import { type query } from "../query";

type Filter = z.infer<typeof query.shape.filter>;
let _typeCheck: Filter | undefined;
//  ^? let _typeCheck: {
//         age?: {
//             eq?: readonly number[] | undefined;
//             gt?: readonly number[] | undefined;
//         } | undefined;
//         isActive?: {
//             eq?: readonly ("true" | "false")[] | undefined;
//         } | undefined;
//         dateOfBirth?: {
//             gte?: readonly Date[] | undefined;
//         } | undefined;
//     } | undefined

const _validSingleFilter: Filter = {
  age: {
    eq: [10],
  },
};

const _validMultipleFilters: Filter = {
  age: {
    eq: [10],
    gt: [9],
  },
  dateOfBirth: {
    gte: [new Date("1990-01-01")],
  },
  isActive: {
    eq: ["true"],
  },
};

const _invalidFilterType: Filter = {
  age: {
    // @ts-expect-error: invalid
    gte: [10],
  },
};

const _invalidFilterDataType: Filter = {
  age: {
    // @ts-expect-error: invalid
    gt: ["10"],
  },
};
/* eslint-enable @typescript-eslint/no-unused-vars */
