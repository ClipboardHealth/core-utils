# require-zod-import-in-contracts

ESLint rule that requires every `*.contract.ts` file to reference `"zod"` in its own module scope — either via an `import` (named, default, namespace, or side-effect) or via a re-export (`export { z } from "zod"`, `export * from "zod"`).

## Motivation

This rule prevents a silent type-safety regression caused by a TypeScript declaration-emit pitfall.

### The bug

When TypeScript emits a `.d.ts` for a contract file, it has to write the inferred type of every exported value into the declaration. For a contract like `initContract().router({ list: { responses: { 200: someZodSchema } } })`, that inferred type embeds the underlying zod types (`ZodObject<...>`, `ZodString`, etc.) — even when `z` is never referenced in the source file directly.

To express those zod types in the emitted `.d.ts`, TypeScript needs a **module specifier** for `"zod"`. It picks one by walking a priority list:

1. **Reuse a source-level reference** to `"zod"` in the file being emitted. Any top-level `import` or re-export with `"zod"` as the source counts — even a side-effect `import "zod"` with no local binding. TypeScript reuses that clean specifier in every inline `import("zod").ZodXxx<...>` it writes, and downstream consumers resolve them correctly.
2. **Synthesize a specifier from the resolved file path.** This is the fallback path. With `module: "nodenext"` and zod 3.25's dual-package layout, the resolved file is `node_modules/zod/index.cjs` — and TypeScript emits the malformed inline import `import("node_modules/zod/index.cjs").ZodObject<...>`. That specifier resolves for no consumer, so every type that references it silently collapses to `any`.

TypeScript specifier synthesis is strictly per-file. The fact that a sibling file (e.g. one this contract imports schemas from) has `import { z } from "zod"` is invisible to the contract file's emit. Each contract file must reference zod in its own scope.

This regression is silent — `tsc` does not error, downstream consumers don't get a compile failure, they just get `any` everywhere they expected typed responses. It was first observed when `@clipboard-health/contract-backend-main`'s `shiftV3.contract.ts` shipped a `.d.ts` with 441 leaked `import("node_modules/zod/index.cjs")` paths, breaking `shiftClient.list()`'s response type for `worker-app-bff`. See ACT-4870.

## Rule Details

The rule fires on any `*.contract.ts` file whose module body contains no `import` or re-export with a source value of `"zod"`. It does not require `z` to be _used_ at source level — only that the `"zod"` specifier appears somewhere in the file's top-level imports or re-exports.

### Examples

#### ❌ Incorrect

```typescript
// my.contract.ts
import { initContract } from "@ts-rest/core";

import { createDto, createResponse } from "./create.contract";
import { listQuery, listResponse } from "./list.contract";

export const myContract = initContract().router({
  create: {
    method: "POST",
    path: "/x",
    body: createDto,
    responses: { 201: createResponse },
  },
  list: {
    method: "GET",
    path: "/x",
    query: listQuery,
    responses: { 200: listResponse },
  },
});
```

The schemas come from sibling files that import zod, but this file's own emit will still leak the `node_modules/zod/...` path.

#### ✅ Correct (zod used at source level)

```typescript
import { initContract } from "@ts-rest/core";
import { z } from "zod";

export const fooSchema = z.object({ id: z.string() });

export const fooContract = initContract().router({
  get: { method: "GET", path: "/foo", responses: { 200: fooSchema } },
});
```

#### ✅ Correct (side-effect import when zod isn't used at source level)

```typescript
import { initContract } from "@ts-rest/core";
import "zod";

import { createDto, createResponse } from "./create.contract";
import { listQuery, listResponse } from "./list.contract";

export const myContract = initContract().router({
  create: {
    method: "POST",
    path: "/x",
    body: createDto,
    responses: { 201: createResponse },
  },
  list: {
    method: "GET",
    path: "/x",
    query: listQuery,
    responses: { 200: listResponse },
  },
});
```

The side-effect `import "zod"` form introduces no local binding, so neither `noUnusedLocals` (TypeScript compiler) nor `@typescript-eslint/no-unused-vars` (ESLint) flags it. It also doesn't expand the package's public export surface. **Prefer this form when zod isn't referenced at source level.**

#### ✅ Also correct (re-export form)

```typescript
import { initContract } from "@ts-rest/core";

import { createDto, createResponse } from "./create.contract";

export { z } from "zod";

export const myContract = initContract().router({
  create: {
    method: "POST",
    path: "/x",
    body: createDto,
    responses: { 201: createResponse },
  },
});
```

The re-export form is functionally equivalent for declaration emit but adds `z` to whatever the package's barrel re-exports. Prefer the side-effect form above unless you explicitly want to re-export `z`.

### Why a bare `import { z } from "zod"` doesn't work

A bare `import { z } from "zod"` with `z` unused at source level fails the build with `error TS6133: 'z' is declared but its value is never read.` That's `noUnusedLocals` at the TypeScript compiler level, which `// eslint-disable-next-line` cannot suppress. You'd have to stack `// @ts-expect-error TS6133` on top of the eslint-disable — strictly worse than either of the correct forms above.

## Configuration

This rule is automatically applied to all `*.contract.ts` files when using `@clipboard-health/eslint-config`.

## When to Disable

This rule should generally not be disabled. The cost of the missing import is silent `any` collapse in downstream consumers, which is hard to detect because it does not produce a compile error. If you have a genuinely unusual case where the file is a `.contract.ts` but contains no inferred types that reference zod, you can disable with:

```typescript
/* eslint-disable @clipboard-health/require-zod-import-in-contracts */
```

## Related

- ACT-4870 (root cause investigation and per-file workaround)
- [`shiftV3.contract.ts` fix in `clipboard-health#25570`](https://github.com/ClipboardHealth/clipboard-health/pull/25570)
