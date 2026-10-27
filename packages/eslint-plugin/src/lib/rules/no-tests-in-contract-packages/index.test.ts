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

const code = `export const value = 1;`;

ruleTester.run("no-tests-in-contract-packages", rule as never, {
  valid: [
    {
      name: "non-test file in a contract package is valid under ESLint",
      filename: "/repo/packages/contract-foo/src/foo.contract.ts",
      code,
    },
    {
      name: "spec in contract-core is valid under ESLint",
      filename: "/repo/packages/contract-core/src/objectId.spec.ts",
      code,
    },
  ],
  invalid: [
    {
      name: "spec in a contract package is reported under ESLint",
      filename: "/repo/packages/contract-foo/src/foo.spec.ts",
      code,
      errors: [{ messageId: "noTestsInContractPackage" }],
    },
  ],
});
