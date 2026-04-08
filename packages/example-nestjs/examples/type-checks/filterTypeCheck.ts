import { type z } from "zod";

import { type query } from "../query";

type Filter = z.infer<typeof query.shape.filter>;

// @ts-expect-error: unused
let _typeCheck: Filter | undefined;
//  ^? let _typeCheck: {
//         age?: {
//             eq?: number[] | undefined;
//             gt?: number[] | undefined;
//         } | undefined;
//         dateOfBirth?: {
//             gte?: Date[] | undefined;
//         } | undefined;
//         isActive?: {
//             eq?: ("true" | "false")[] | undefined;
//         } | undefined;
//     } | undefined

// @ts-expect-error: unused
const _validSingleFilter: Filter = {
  age: {
    eq: [10],
  },
};

// @ts-expect-error: unused
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

// @ts-expect-error: unused
const _invalidFilterType: Filter = {
  age: {
    // @ts-expect-error: invalid
    gte: [10],
  },
};

// @ts-expect-error: unused
const _invalidFilterDataType: Filter = {
  age: {
    // @ts-expect-error: invalid
    gt: ["10"],
  },
};
