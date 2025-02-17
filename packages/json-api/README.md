# @clipboard-health/json-api <!-- omit from toc -->

TypeScript-friendly utilities for adhering to the [JSON:API](https://jsonapi.org/) specification.

## Table of contents <!-- omit from toc -->

- [Install](#install)
- [Usage](#usage)
  - [Query helpers](#query-helpers)
- [Local development commands](#local-development-commands)

## Install

```bash
npm install @clipboard-health/json-api
```

## Usage

### Query helpers

From the client, call `stringifyQuery` to convert from `JsonApiQuery` to `URLSearchParams`:

<embedex source="packages/json-api/examples/stringifyQuery.ts">

```ts
import { deepEqual } from "node:assert/strict";

import { stringifyQuery } from "@clipboard-health/json-api";

import { type ClientJsonApiQuery } from "../src/lib/types";

const [date1, date2] = ["2024-01-01", "2024-01-02"];
const query: ClientJsonApiQuery = {
  fields: { user: ["age", "dateOfBirth"] },
  filter: {
    age: 2,
    dateOfBirth: {
      gt: date1,
      lt: date2,
    },
    isActive: true,
  },
  include: "article",
  page: {
    size: 10,
  },
  sort: "-age",
};

deepEqual(
  stringifyQuery(query),
  new URLSearchParams(
    `fields[user]=age,dateOfBirth&filter[age]=2&filter[dateOfBirth][gt]=${date1}&filter[dateOfBirth][lt]=${date2}&filter[isActive]=true&include=article&page[size]=10&sort=-age`,
  ).toString(),
);
```

</embedex>

From the server, call `parseQuery` to convert from `URLSearchParams` to `ServerJsonApiQuery`:

<embedex source="packages/json-api/examples/parseQuery.ts">

```ts
import { deepEqual } from "node:assert/strict";

import { parseQuery } from "@clipboard-health/json-api";
import { type ParsedQs } from "qs";

const [date1, date2] = ["2024-01-01", "2024-01-02"];
// The URLSearchParams constructor also supports URL-encoded strings
const searchParams = new URLSearchParams(
  `fields[user]=age,dateOfBirth&filter[age]=2&filter[dateOfBirth][gt]=${date1}&filter[dateOfBirth][lt]=${date2}&filter[isActive]=true&include=article&page[size]=10&sort=-age`,
);

const query: ParsedQs = parseQuery(searchParams.toString());

deepEqual(query, {
  fields: { user: ["age", "dateOfBirth"] },
  filter: {
    age: "2",
    dateOfBirth: { gt: date1, lt: date2 },
    isActive: "true",
  },
  include: "article",
  page: {
    size: "10",
  },
  sort: "-age",
});
```

</embedex>

## Local development commands

See [`package.json`](./package.json) `scripts` for a list of commands.
