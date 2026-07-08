import path from "node:path";

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

const inContractPackage = path.join(
  __dirname,
  "fixtures",
  "contract-package",
  "src",
  "foo.contract.ts",
);
const inNestedNamelessDirectory = path.join(
  __dirname,
  "fixtures",
  "contract-package",
  "nested-no-name",
  "bar.contract.ts",
);
const inConsumerApp = path.join(__dirname, "fixtures", "consumer-app", "src", "worker.ts");

// oxlint-disable-next-line vitest/expect-expect -- RuleTester validates declaratively
ruleTester.run("no-cross-contract-imports", rule, {
  valid: [
    {
      name: "contract-core import is the allowed shared dependency",
      filename: inContractPackage,
      code: `import { dateTimeSchema, objectId } from "@clipboard-health/contract-core";`,
    },
    {
      name: "contract-core subpath import is allowed",
      filename: inContractPackage,
      code: `import { objectId } from "@clipboard-health/contract-core/objectId";`,
    },
    {
      name: "non-contract @clipboard-health packages are allowed",
      filename: inContractPackage,
      code: `
        import { isDefined } from "@clipboard-health/util-ts";
        import { booleanString } from "@clipboard-health/json-api-nestjs";
      `,
    },
    {
      name: "third-party and relative imports are allowed",
      filename: inContractPackage,
      code: `
        import { initContract } from "@ts-rest/core";
        import { z } from "zod";
        import { fooSchema } from "./foo.schemas";
      `,
    },
    {
      name: "outside a contract package the rule does not apply",
      filename: inConsumerApp,
      code: `
        import { shiftContract } from "@clipboard-health/contract-backend-main";
        export * from "@clipboard-health/api-contract-curated-shifts";
      `,
    },
  ],
  invalid: [
    {
      name: "value import of another contract package",
      filename: inContractPackage,
      code: `import { WorkplaceIdSchema } from "@clipboard-health/contract-backend-main";`,
      errors: [{ messageId: "noCrossContractImport" }],
    },
    {
      name: "type-only import still pins the dependency",
      filename: inContractPackage,
      code: `import type { Shift } from "@clipboard-health/contract-backend-main";`,
      errors: [{ messageId: "noCrossContractImport" }],
    },
    {
      name: "api-contract-* packages are banned",
      filename: inContractPackage,
      code: `import { shiftSchema } from "@clipboard-health/api-contract-curated-shifts";`,
      errors: [{ messageId: "noCrossContractImport" }],
    },
    {
      name: "flag-* packages are banned",
      filename: inContractPackage,
      code: `import { someFlag } from "@clipboard-health/flag-backend-main";`,
      errors: [{ messageId: "noCrossContractImport" }],
    },
    {
      name: "deep import of another contract package",
      filename: inContractPackage,
      code: `import { shiftSchema } from "@clipboard-health/contract-backend-main/dist/lib/shift.contract";`,
      errors: [{ messageId: "noCrossContractImport" }],
    },
    {
      name: "re-export passthrough of another contract package",
      filename: inContractPackage,
      code: `export * from "@clipboard-health/contract-home-health-api";`,
      errors: [{ messageId: "noCrossContractImport" }],
    },
    {
      name: "named re-export with source",
      filename: inContractPackage,
      code: `export { VisitSchema } from "@clipboard-health/contract-home-health-api";`,
      errors: [{ messageId: "noCrossContractImport" }],
    },
    {
      name: "type-only re-export",
      filename: inContractPackage,
      code: `export type { Visit } from "@clipboard-health/contract-home-health-api";`,
      errors: [{ messageId: "noCrossContractImport" }],
    },
    {
      name: "dynamic import",
      filename: inContractPackage,
      code: `const contract = await import("@clipboard-health/contract-payment-service");`,
      errors: [{ messageId: "noCrossContractImport" }],
    },
    {
      name: "require call",
      filename: inContractPackage,
      code: `const contract = require("@clipboard-health/contract-documents-service");`,
      errors: [{ messageId: "noCrossContractImport" }],
    },
    {
      name: "import-equals require",
      filename: inContractPackage,
      code: `import contract = require("@clipboard-health/contract-backend-main");`,
      errors: [{ messageId: "noCrossContractImport" }],
    },
    {
      name: "nameless build-marker package.json does not stop the package lookup",
      filename: inNestedNamelessDirectory,
      code: `import { shiftSchema } from "@clipboard-health/contract-backend-main";`,
      errors: [{ messageId: "noCrossContractImport" }],
    },
    {
      name: "multiple violations each report",
      filename: inContractPackage,
      code: `
        import { a } from "@clipboard-health/contract-backend-main";
        export * from "@clipboard-health/flag-backend-main";
      `,
      errors: [{ messageId: "noCrossContractImport" }, { messageId: "noCrossContractImport" }],
    },
  ],
});
