# @clipboard-health/util-ts <!-- omit from toc -->

TypeScript utilities.

## Table of contents <!-- omit from toc -->

- [Install](#install)
- [Usage](#usage)
  - [ServiceError](#serviceerror)
  - [ServiceResult](#serviceresult)
    - [`success`](#success)
    - [`failure`](#failure)
    - [`tryCatchAsync`](#trycatchasync)
    - [`tryCatch`](#trycatch)
    - [`fromSafeParseReturnType`](#fromsafeparsereturntype)
    - [`mapFailure`](#mapfailure)
  - [Functional](#functional)
    - [`pipe`](#pipe)
    - [`option`](#option)
    - [`either`](#either)
- [Local development commands](#local-development-commands)

## Install

```bash
npm install @clipboard-health/util-ts
```

## Usage

See `./src/lib` for each utility.

### ServiceError

<embedex source="packages/util-ts/examples/serviceError.ts">

```ts
import { deepEqual, equal } from "node:assert/strict";

import { ERROR_CODES, ServiceError } from "@clipboard-health/util-ts";
import { z } from "zod";

{
  const error = new ServiceError("boom");
  equal(error.toString(), `ServiceError[${error.id}]: [internal]: boom`);
}

try {
  throw new Error("boom");
} catch (error) {
  const serviceError = ServiceError.fromUnknown(error);
  equal(serviceError.toString(), `ServiceError[${serviceError.id}]: [internal]: boom`);
}

{
  const serviceError = ServiceError.fromZodError(
    new z.ZodError([{ code: "custom", path: ["foo"], message: "boom" }]),
  );
  equal(serviceError.toString(), `ServiceError[${serviceError.id}]: [badRequest]: boom`);
}

{
  const errorWithCause = new ServiceError({
    issues: [{ message: "boom" }],
    cause: new Error("Original error"),
  });
  equal(errorWithCause.toString(), `ServiceError[${errorWithCause.id}]: [internal]: boom`);
}

{
  const multipleIssues = new ServiceError({
    issues: [
      {
        code: ERROR_CODES.badRequest,
        message: "Invalid email format",
        path: ["data", "attributes", "email"],
      },
      {
        code: ERROR_CODES.unprocessableEntity,
        message: "Phone number too short",
        path: ["data", "attributes", "phoneNumber"],
      },
    ],
    cause: new Error("Original error"),
  });

  equal(
    multipleIssues.toString(),
    `ServiceError[${multipleIssues.id}]: [badRequest]: Invalid email format; [unprocessableEntity]: Phone number too short`,
  );

  deepEqual(multipleIssues.toJsonApi(), {
    errors: [
      {
        id: multipleIssues.id,
        status: "400",
        code: "badRequest",
        title: "Invalid or malformed request",
        detail: "Invalid email format",
        source: {
          pointer: "/data/attributes/email",
        },
      },
      {
        id: multipleIssues.id,
        status: "422",
        code: "unprocessableEntity",
        title: "Request failed validation",
        detail: "Phone number too short",
        source: {
          pointer: "/data/attributes/phoneNumber",
        },
      },
    ],
  });
}
```

</embedex>

### ServiceResult

#### `success`

<embedex source="packages/util-ts/examples/success.ts">

```ts
import { equal, ok } from "node:assert/strict";

import { either as E, success } from "@clipboard-health/util-ts";

const result = success("Hello, World!");

ok(E.isRight(result));
equal(result.right, "Hello, World!");
```

</embedex>

#### `failure`

<embedex source="packages/util-ts/examples/failure.ts">

```ts
import { equal, ok } from "node:assert/strict";

import { ERROR_CODES, failure, isFailure } from "@clipboard-health/util-ts";

const result = failure({
  issues: [{ code: ERROR_CODES.notFound, message: "User not found" }],
});

ok(isFailure(result));
equal(result.left.issues[0]?.message, "User not found");
```

</embedex>

#### `tryCatchAsync`

<embedex source="packages/util-ts/examples/tryCatchAsync.ts">

```ts
import { equal, ok } from "node:assert/strict";

import { isFailure, isSuccess, ServiceError, tryCatchAsync } from "@clipboard-health/util-ts";

async function fetchJson() {
  const response = await fetch("https://jsonplaceholder.typicode.com/posts/1");
  return (await response.json()) as { id: number };
}

async function example() {
  const successResult = await tryCatchAsync(
    fetchJson(),
    (error) => new ServiceError(`Failed to fetch: ${String(error)}`),
  );

  ok(isSuccess(successResult));
  equal(successResult.right.id, 1);

  const failureResult = await tryCatchAsync(
    Promise.reject(new Error("Network error")),
    (error) => new ServiceError(`Failed to fetch: ${String(error)}`),
  );

  ok(isFailure(failureResult));
  equal(failureResult.left.issues[0]?.message, "Failed to fetch: Error: Network error");
}

// eslint-disable-next-line unicorn/prefer-top-level-await
void example();
```

</embedex>

#### `tryCatch`

<embedex source="packages/util-ts/examples/tryCatch.ts">

```ts
import { equal, ok } from "node:assert/strict";

import { isFailure, isSuccess, parseJson, ServiceError, tryCatch } from "@clipboard-health/util-ts";

const successResult = tryCatch(
  () => parseJson<{ name: string }>('{"name": "John"}'),
  (error) => new ServiceError(`Parse error: ${String(error)}`),
);

ok(isSuccess(successResult));
equal(successResult.right.name, "John");

const failureResult = tryCatch(
  () => parseJson("invalid json"),
  (error) => new ServiceError(`Parse error: ${String(error)}`),
);

ok(isFailure(failureResult));
ok(failureResult.left.issues[0]?.message?.includes("Parse error"));
```

</embedex>

#### `fromSafeParseReturnType`

<embedex source="packages/util-ts/examples/fromSafeParseReturnType.ts">

```ts
import { equal, ok } from "node:assert/strict";

import { fromSafeParseReturnType, isFailure, isSuccess } from "@clipboard-health/util-ts";
import { z } from "zod";

const schema = z.object({ name: z.string(), age: z.number() });

const validData = { name: "John", age: 30 };
const successResult = fromSafeParseReturnType(schema.safeParse(validData));

ok(isSuccess(successResult));
equal(successResult.right.name, "John");

const invalidData = { name: "John", age: "thirty" };
const failureResult = fromSafeParseReturnType(schema.safeParse(invalidData));

ok(isFailure(failureResult));
ok(failureResult.left.issues.length > 0);
```

</embedex>

#### `mapFailure`

<embedex source="packages/util-ts/examples/mapFailure.ts">

```ts
import { equal, ok } from "node:assert/strict";

import { either as E, failure, mapFailure, ServiceError, success } from "@clipboard-health/util-ts";

const transformError = mapFailure(
  (error: ServiceError) => `Transformed: ${error.issues[0]?.message}`,
);

const failureResult = failure(new ServiceError("Original error"));
const transformedFailure = transformError(failureResult);

ok(E.isLeft(transformedFailure));
equal(transformedFailure.left, "Transformed: Original error");

const successResult = success("data");
const transformedSuccess = transformError(successResult);

ok(E.isRight(transformedSuccess));
equal(transformedSuccess.right, "data");
```

</embedex>

### Functional

#### `pipe`

<embedex source="packages/util-ts/examples/pipe.ts">

```ts
import { equal } from "node:assert/strict";

import { pipe } from "@clipboard-health/util-ts";

const result = pipe(
  "  hello world  ",
  (s) => s.trim(),
  (s) => s.split(" "),
  (array) => array.map((word) => word.charAt(0).toUpperCase() + word.slice(1)),
  (array) => array.join(" "),
);

equal(result, "Hello World");
```

</embedex>

#### `option`

<embedex source="packages/util-ts/examples/option.ts">

```ts
import { equal } from "node:assert/strict";

import { option as O, pipe } from "@clipboard-health/util-ts";

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
    () => "No result",
    (n) => `Result is ${n}`,
  ),
);

equal(result, "Result is 0.1");
```

</embedex>

#### `either`

<embedex source="packages/util-ts/examples/either.ts">

```ts
import { equal } from "node:assert/strict";

import { either as E, pipe } from "@clipboard-health/util-ts";

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

</embedex>

## Local development commands

See [`package.json`](./package.json) `scripts` for a list of commands.
