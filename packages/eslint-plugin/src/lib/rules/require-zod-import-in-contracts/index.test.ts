import { TSESLint } from "@typescript-eslint/utils";

import rule from "./index";

// eslint-disable-next-line n/no-unpublished-require
const parser = require.resolve("@typescript-eslint/parser");

const ruleTester = new TSESLint.RuleTester({
  parser,
  parserOptions: {
    ecmaVersion: 2020,
    sourceType: "module",
  },
});

ruleTester.run("require-zod-import-in-contracts", rule, {
  valid: [
    {
      name: "named zod import used at source level",
      code: `
        import { z } from "zod";

        export const fooSchema = z.object({ id: z.string() });
      `,
    },
    {
      name: "default zod import",
      code: `
        import z from "zod";

        export const fooSchema = z.object({ id: z.string() });
      `,
    },
    {
      name: "namespace zod import",
      code: `
        import * as zod from "zod";

        export const fooSchema = zod.object({ id: zod.string() });
      `,
    },
    {
      name: "re-export from zod (load-bearing for declaration emit)",
      code: `
        import { initContract } from "@ts-rest/core";

        import { fooSchema } from "./foo.contract";
        import { barSchema } from "./bar.contract";

        export { z } from "zod";

        export const myContract = initContract().router({
          foo: { method: "GET", path: "/foo", responses: { 200: fooSchema } },
          bar: { method: "POST", path: "/bar", body: barSchema, responses: { 201: fooSchema } },
        });
      `,
    },
    {
      name: "export-all from zod",
      code: `
        export * from "zod";
      `,
    },
    {
      name: "side-effect import of zod still satisfies the rule",
      code: `
        import "zod";

        export const value = 1;
      `,
    },
  ],
  invalid: [
    {
      name: "no zod reference — composes schemas from sibling files only (the shiftV3 case)",
      code: `
        import { initContract } from "@ts-rest/core";

        import { createDto, createResponse } from "./create.contract";
        import { listQuery, listResponse } from "./list.contract";

        export const myContract = initContract().router({
          create: { method: "POST", path: "/x", body: createDto, responses: { 201: createResponse } },
          list: { method: "GET", path: "/x", query: listQuery, responses: { 200: listResponse } },
        });
      `,
      errors: [{ messageId: "missingZodReference" }],
    },
    {
      name: "imports from unrelated packages but never zod",
      code: `
        import { initContract } from "@ts-rest/core";

        export const empty = initContract().router({});
      `,
      errors: [{ messageId: "missingZodReference" }],
    },
    {
      name: "imports from a similarly-named package, not zod",
      code: `
        import { something } from "zod-extras";

        export const value = something;
      `,
      errors: [{ messageId: "missingZodReference" }],
    },
  ],
});
