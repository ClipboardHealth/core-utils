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

ruleTester.run("enforce-ts-rest-in-controllers", rule, {
  valid: [
    {
      name: "controller method uses ts-rest imports, decorator, and handler",
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
    {
      name: "constructors and private methods remain outside the rule's scope",
      code: `
        class ExampleController {
          public constructor() {}
          private getInternalExample() { return {}; }
        }
      `,
    },
  ],
  invalid: [
    {
      name: "controller method omits the ts-rest decorator and handler return",
      code: `
        class ExampleController {
          public getExample() {
            return {};
          }
        }
      `,
      errors: [{ messageId: "missingDecorator" }, { messageId: "missingReturn" }],
    },
    {
      name: "matching symbols must be imported from @ts-rest/nest",
      code: `
        import { TsRestHandler, tsRestHandler } from "somewhere-else";

        class ExampleController {
          @TsRestHandler()
          public getExample() {
            return tsRestHandler(exampleContract, async () => ({ status: 200, body: {} }));
          }
        }
      `,
      errors: [{ messageId: "decoratorNotFromPackage" }, { messageId: "callNotFromPackage" }],
    },
    {
      name: "the handler call must be the method's only statement",
      code: `
        import { TsRestHandler, tsRestHandler } from "@ts-rest/nest";

        class ExampleController {
          @TsRestHandler()
          public getExample() {
            logRequest();
            return tsRestHandler(exampleContract, async () => ({ status: 200, body: {} }));
          }
        }
      `,
      errors: [{ messageId: "missingReturn" }],
    },
  ],
});
