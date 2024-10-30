# @clipboard-health/util-typescript <!-- omit from toc -->

TypeScript utilities.

## Table of contents <!-- omit from toc -->

- [Install](#install)
- [Usage](#usage)
  - [Functional utilities](#functional-utilities)
- [Local development commands](#local-development-commands)

## Install

```bash
npm install @clipboard-health/util-typescript
```

## Usage

See `./src/lib` for each utility.

### Functional utilities

<!-- prettier-ignore -->
```ts
// ./examples/pipe.ts

import { equal } from "node:assert/strict";

import { pipe } from "@clipboard-health/util-typescript";

const result = pipe(
  "  hello world  ",
  (s) => s.trim(),
  (s) => s.split(" "),
  (array) => array.map((word) => word.charAt(0).toUpperCase() + word.slice(1)),
  (array) => array.join(" "),
);

equal(result, "Hello World");

```

<!-- prettier-ignore -->
```ts
// ./examples/option.ts

import { equal } from "node:assert/strict";

import { option as O, pipe } from "@clipboard-health/util-typescript";

function double(n: number) {
  return n * 2;
}

function inverse(n: number): O.Option<number> {
  return n === 0 ? O.none : O.some(1 / n);
}

const result = pipe(
  O.some(5),
  O.map(double),
  O.flatMap(inverse),
  O.match(
    (n) => `Result is ${n}`,
    () => "No result",
  ),
);

equal(result, "Result is 0.1");

```

<!-- prettier-ignore -->
```ts
// ./examples/either.ts

import { equal } from "node:assert/strict";

import { either as E, pipe } from "@clipboard-health/util-typescript";

function double(n: number): number {
  return n * 2;
}

function inverse(n: number): E.Either<string, number> {
  return n === 0 ? E.left("Division by zero") : E.right(1 / n);
}

const result = pipe(
  E.right(5),
  E.map(double),
  E.flatMap(inverse),
  E.match(
    (error) => `Error: ${error}`,
    (result) => `Result is ${result}`,
  ),
);

equal(result, "Result is 0.1");

```

## Local development commands

See [`package.json`](./package.json) `scripts` for a list of commands.
