# @clipboard-health/json-api-nestjs

Utilities for adhering to the [JSON:API](https://jsonapi.org/) specification with [NestJS](https://nestjs.com/).

## Table of Contents

- [Install](#install)
- [Usage](#usage)
  - [Query helpers](#query-helpers)
- [Local development commands](#local-development-commands)

## Install

```bash
npm install @clipboard-health/json-api-nestjs
```

## Usage

### Query helpers

Create Zod schemas for your API's queries:

<!-- prettier-ignore -->
```ts
// ./examples/query.ts

import {
  booleanString,
  createCursorPagination,
  createFields,
  createFilter,
  createInclude,
  createSort,
} from "@clipboard-health/json-api-nestjs";
import { z } from "zod";

export const paginationQuery = z.object(createCursorPagination()).strict();

export const fieldsQuery = z
  .object(createFields({ user: ["age", "name"], article: ["title"] }))
  .strict();

export const filterQuery = z
  .object(
    createFilter({
      age: {
        filters: ["eq", "gt"],
        schema: z.coerce.number().int().positive().max(125),
      },
      isActive: {
        filters: ["eq"],
        schema: booleanString,
      },
      dateOfBirth: {
        filters: ["gte"],
        schema: z.coerce.date().min(new Date("1900-01-01")),
      },
    }),
  )
  .strict();

export const sortQuery = z.object(createSort(["age", "name"])).strict();

export const includeQuery = z.object(createInclude(["articles", "articles.comments"])).strict();

export const compoundQuery = z.object({
  ...createCursorPagination(),
  ...createFields({ user: ["age", "name"] }),
  ...createFilter({ isActive: { filters: ["eq"], schema: booleanString } }),
  ...createSort(["age"]),
  ...createInclude(["articles"]),
});

```

## Local development commands

See [`package.json`](./package.json) `scripts` for a list of commands.
