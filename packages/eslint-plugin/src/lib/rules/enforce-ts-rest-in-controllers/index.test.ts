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

describe("enforce-ts-rest-in-controllers alias under ESLint", () => {
  it("reports enforce-contract-in-controllers as its replacement", () => {
    expect(rule.meta?.replacedBy).toStrictEqual(["enforce-contract-in-controllers"]);
  });
});

ruleTester.run("enforce-ts-rest-in-controllers", rule as never, {
  valid: [
    {
      name: "oRPC controller methods pass under the alias",
      code: `
        import { Implement, implement } from "@orpc/nest";

        class ExampleController {
          @Implement(exampleContract.get)
          public getExample() {
            return implement(exampleContract.get).handler(async () => ({ data: {} }));
          }
        }
      `,
    },
  ],
  invalid: [
    {
      name: "missing contract handlers are reported under the alias",
      code: `
        class ExampleController {
          public getExample() {
            return {};
          }
        }
      `,
      errors: [{ messageId: "missingDecorator" }, { messageId: "missingReturn" }],
    },
  ],
});
