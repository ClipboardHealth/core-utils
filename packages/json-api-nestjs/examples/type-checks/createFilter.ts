/* eslint-disable @typescript-eslint/no-unused-vars */
import { type z } from "zod";

import { type filterQuery } from "../query";

type Query = z.infer<typeof filterQuery>;
let _queryTypeCheck: Query | undefined;
//  ^? let _queryTypeCheck: {
//         filter?: {
//             age?: {
//                 eq?: number[] | undefined;
//                 gt?: number[] | undefined;
//             } | undefined;
//             isActive?: {
//                 eq?: boolean[] | undefined;
//             } | undefined;
//             dateOfBirth?: {
//                 gte?: Date[] | undefined;
//             } | undefined;
//         } | undefined;
//     } | undefined

const _validSingleFilter: Query = {
  filter: {
    age: {
      eq: [10],
    },
  },
};

const _validMultipleFilters: Query = {
  filter: {
    age: {
      eq: [10],
      gt: [9],
    },
    dateOfBirth: {
      gte: [new Date("1990-01-01")],
    },
    isActive: {
      eq: [true],
    },
  },
};

const _invalidFilterType: Query = {
  filter: {
    age: {
      // @ts-expect-error: invalid
      gte: [10],
    },
  },
};

const _invalidFilterDataType: Query = {
  filter: {
    age: {
      // @ts-expect-error: invalid
      gt: ["10"],
    },
  },
};
/* eslint-enable @typescript-eslint/no-unused-vars */
