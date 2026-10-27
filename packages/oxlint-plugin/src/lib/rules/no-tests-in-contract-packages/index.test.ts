import { RuleTester } from "oxlint/plugins-dev";

import rule from "./index";

RuleTester.describe = (name, run) => {
  describe(name, () => {
    run();
  });
};
RuleTester.it = it;

const ruleTester = new RuleTester({
  languageOptions: {
    parserOptions: { lang: "ts" },
    sourceType: "module",
  },
});

const code = `export const value = 1;`;

ruleTester.run("no-tests-in-contract-packages", rule, {
  valid: [
    {
      name: "non-test file in a contract package",
      filename: "/repo/packages/contract-foo/src/lib/foo.contract.ts",
      code,
    },
    {
      name: "test utilities in a contract package are not test files",
      filename: "/repo/packages/contract-foo/src/testUtils/mocks.ts",
      code,
    },
    {
      name: "spec in contract-core, the shared schema-helper library",
      filename: "/repo/packages/contract-core/src/lib/schemas/objectId.spec.ts",
      code,
    },
    {
      name: "spec in a non-contract package",
      filename: "/repo/packages/util-ts/src/lib/isDefined.spec.ts",
      code,
    },
    {
      name: "spec in a service app",
      filename: "/repo/src/modules/shifts/shift.controller.spec.ts",
      code,
    },
    {
      name: "package whose name only contains 'contract'",
      filename: "/repo/packages/api-contract-curated-shifts/src/index.spec.ts",
      code,
    },
    {
      name: "spec in a workspace package of a repository checked out under packages/contract-*",
      filename: "/home/ci/packages/contract-foo/packages/service/src/foo.spec.ts",
      code,
    },
    {
      name: "a file named like a contract package directory, not inside one",
      filename: "/repo/packages/contract-foo.spec.ts",
      code,
    },
    {
      name: "contract-core with Windows separators",
      filename: String.raw`C:\repo\packages\contract-core\src\objectId.spec.ts`,
      code,
    },
  ],
  invalid: [
    {
      name: "spec in a contract package",
      filename: "/repo/packages/contract-foo/src/foo.spec.ts",
      code,
      errors: [{ messageId: "noTestsInContractPackage" }],
    },
    {
      name: "test file in a contract package",
      filename: "/repo/packages/contract-foo/src/foo.test.ts",
      code,
      errors: [{ messageId: "noTestsInContractPackage" }],
    },
    {
      name: "nested spec in a contract package",
      filename:
        "/repo/packages/contract-backend-main/src/lib/contracts/shifts/v3/shift.contract.spec.ts",
      code,
      errors: [{ messageId: "noTestsInContractPackage" }],
    },
    {
      name: "spec at a relative path",
      filename: "packages/contract-license-manager/src/index.spec.ts",
      code,
      errors: [{ messageId: "noTestsInContractPackage" }],
    },
    {
      name: "spec outside src in a contract package",
      filename: "/repo/packages/contract-foo/test/foo.spec.ts",
      code,
      errors: [{ messageId: "noTestsInContractPackage" }],
    },
    ...["tsx", "mts", "cts", "js", "jsx", "mjs", "cjs"].map((extension) => ({
      name: `.spec.${extension} in a contract package`,
      filename: `/repo/packages/contract-foo/src/foo.spec.${extension}`,
      code,
      errors: [{ messageId: "noTestsInContractPackage" }],
    })),
    {
      name: "spec in a contract package with Windows separators",
      filename: String.raw`C:\repo\packages\contract-foo\src\foo.spec.ts`,
      code,
      errors: [{ messageId: "noTestsInContractPackage" }],
    },
  ],
});
