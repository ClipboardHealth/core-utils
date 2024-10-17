# @clipboard-health/json-api <!-- omit from toc -->

Utilities for adhering to the [JSON:API](https://jsonapi.org/) specification.

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

From the client, call `toClientSearchParams` to convert from `ClientJsonApiQuery` to `URLSearchParams`:

<!-- prettier-ignore -->
```ts
// ./examples/toClientSearchParams.ts

import { deepEqual } from "node:assert/strict";

import { toClientSearchParams } from "@clipboard-health/json-api";

import { type ClientJsonApiQuery } from "../src/lib/types";

const [date1, date2] = ["2024-01-01", "2024-01-02"];
const query: ClientJsonApiQuery = {
  fields: { user: ["age", "dateOfBirth"] },
  filter: {
    age: { eq: ["2"] },
    dateOfBirth: { gt: [date1], lt: [date2] },
    isActive: { eq: ["true"] },
  },
  include: ["article"],
  page: {
    size: "10",
  },
  sort: ["-age"],
};

deepEqual(
  toClientSearchParams(query).toString(),
  new URLSearchParams(
    `fields[user]=age,dateOfBirth&filter[age]=2&filter[dateOfBirth][gt]=${date1}&filter[dateOfBirth][lt]=${date2}&filter[isActive]=true&include=article&page[size]=10&sort=-age`,
  ).toString(),
);

```

From the server, call `toServerJsonApiQuery` to convert from `URLSearchParams` to `ServerJsonApiQuery`:

<!-- prettier-ignore -->
```ts
// ./examples/toServerJsonApiQuery.ts

import { deepEqual } from "node:assert/strict";

import { type ServerJsonApiQuery, toServerJsonApiQuery } from "@clipboard-health/json-api";

const [date1, date2] = ["2024-01-01", "2024-01-02"];
// The URLSearchParams constructor also supports URL-encoded strings
const searchParams = new URLSearchParams(
  `fields[user]=age,dateOfBirth&filter[age]=2&filter[dateOfBirth][gt]=${date1}&filter[dateOfBirth][lt]=${date2}&filter[isActive]=true&include=article&page[size]=10&sort=-age`,
);

const query: ServerJsonApiQuery = toServerJsonApiQuery(searchParams);

deepEqual(query, {
  fields: { user: ["age", "dateOfBirth"] },
  filter: {
    age: { eq: ["2"] },
    dateOfBirth: { gt: [date1], lt: [date2] },
    isActive: { eq: ["true"] },
  },
  include: ["article"],
  page: {
    size: "10",
  },
  sort: ["-age"],
});

```

## Local development commands

See [`package.json`](./package.json) `scripts` for a list of commands.
