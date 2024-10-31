# @clipboard-health/util-ts <!-- omit from toc -->

TypeScript utilities.

## Table of contents <!-- omit from toc -->

- [Install](#install)
- [Usage](#usage)
  - [ServiceError](#serviceerror)
  - [ServiceResult](#serviceresult)
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

<!-- prettier-ignore -->
```ts
// ./examples/serviceError.ts

import { deepEqual, equal } from "node:assert/strict";

import { ERROR_CODES, ServiceError } from "@clipboard-health/util-ts";

{
  const error = new ServiceError("boom");
  equal(error.toString(), `ServiceError[${error.id}]: [internal]: boom`);
}

{
  const error = new Error("boom");
  const serviceError = ServiceError.fromUnknown(error);
  equal(
    serviceError.toString(),
    `ServiceError[${serviceError.id}]: [internal]: boom; [cause]: Error: boom`,
  );
}

{
  const errorWithCause = new ServiceError({
    issues: [{ message: "boom" }],
    cause: new Error("Original error"),
  });
  equal(
    errorWithCause.toString(),
    `ServiceError[${errorWithCause.id}]: [internal]: boom; [cause]: Error: Original error`,
  );
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
    `ServiceError[${multipleIssues.id}]: [badRequest]: Invalid email format; [unprocessableEntity]: Phone number too short; [cause]: Error: Original error`,
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

### ServiceResult

<!-- prettier-ignore -->
```ts
// ./examples/serviceResult.ts

import { ok } from "node:assert/strict";

import {
  either as E,
  ERROR_CODES,
  failure,
  type ServiceResult,
  success,
} from "@clipboard-health/util-ts";

function validateUser(params: { email: string; phone: string }): ServiceResult<{ id: string }> {
  const { email, phone } = params;
  const code = ERROR_CODES.unprocessableEntity;

  if (!email.includes("@")) {
    return failure({ issues: [{ code, message: "Invalid email format" }] });
  }

  if (phone.length !== 12) {
    return failure({ issues: [{ code, message: "Invalid phone number" }] });
  }

  return success({ id: "user-123" });
}

ok(E.isLeft(validateUser({ email: "invalidEmail", phone: "invalidPhoneNumber" })));
ok(E.isRight(validateUser({ email: "user@example.com", phone: "555-555-5555" })));

```

### Functional

#### `pipe`

<!-- prettier-ignore -->
```ts
// ./examples/pipe.ts

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

#### `option`

<!-- prettier-ignore -->
```ts
// ./examples/option.ts

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

#### `either`

<!-- prettier-ignore -->
```ts
// ./examples/either.ts

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

## Local development commands

See [`package.json`](./package.json) `scripts` for a list of commands.
