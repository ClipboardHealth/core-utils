# @clipboard-health/json-api

Utilities for adhering to the [JSON:API](https://jsonapi.org/) specification.

## Table of Contents

- [Install](#install)
- [Usage](#usage)
- [Local development commands](#local-development-commands)

## Install

```bash
npm install @clipboard-health/json-api
```

## Usage

### Query helpers

From the client, call `toSearchParams` to convert from `JsonApiQuery` to `URLSearchParams`:

<!-- prettier-ignore -->
```ts
// ./examples/toSearchParams.ts

import { toSearchParams } from "@clipboard-health/json-api";

import { type JsonApiQuery } from "../src/lib/types";

const query: JsonApiQuery = {
  fields: { dog: ["age", "name"] },
  filter: { age: ["2", "5"] },
  include: ["vet"],
  page: { size: "10" },
  sort: ["-age"],
};

console.log(toSearchParams(query).toString());
// Note: actual result is URL-encoded, but unencoded below for readability
// => fields[dog]=age,name&filter[age]=2,5&include=vet&page[size]=10&sort=-age

```

From the server, call `toJsonApiQuery` to convert from `URLSearchParams` to `JsonApiQuery`:

<!-- prettier-ignore -->
```ts
// ./examples/toJsonApiQuery.ts

import { toJsonApiQuery } from "@clipboard-health/json-api";

const searchParams = new URLSearchParams(
  "fields%5Bdog%5D=age%2Cname&filter%5Bage%5D=2%2C5&include=vet&page%5Bsize%5D=10&sort=-age",
);

console.log(toJsonApiQuery(searchParams));
// => {
//   fields: { dog: ["age", "name"] },
//   filter: { age: ["2", "5"] },
//   include: ["vet"],
//   page: { size: "10" },
//   sort: ["-age"],
// }

```

## Local development commands

See [`package.json`](./package.json) `scripts` for a list of commands.
