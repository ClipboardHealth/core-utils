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

// oxlint-disable-next-line vitest/expect-expect -- RuleTester validates declaratively
ruleTester.run("enforce-ts-rest-in-controllers", rule as never, {
  valid: [
    {
      name: "ts-rest controller methods remain valid under ESLint",
      code: `
        import { TsRestHandler, tsRestHandler } from "@ts-rest/nest";

        class ExampleController {
          @TsRestHandler()
          public getExample() {
            return tsRestHandler(exampleContract, async () => ({ status: 200, body: {} }));
          }
        }
      `,
    },
  ],
  invalid: [
    {
      name: "missing ts-rest enforcement remains reported under ESLint",
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
