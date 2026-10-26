import { RuleTester } from "oxlint/plugins-dev";

import enforceContractInControllers from "../enforce-contract-in-controllers";
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

describe("enforce-ts-rest-in-controllers alias", () => {
  it("is deprecated in favor of enforce-contract-in-controllers", () => {
    expect(rule.meta?.deprecated).toStrictEqual({
      message: "Renamed to `enforce-contract-in-controllers`, which accepts the same options.",
      replacedBy: [{ rule: { name: "enforce-contract-in-controllers" } }],
    });
    expect(rule.meta?.replacedBy).toStrictEqual(["enforce-contract-in-controllers"]);
  });

  it("shares the replacement rule's implementation, options and messages", () => {
    expect(rule.create).toBe(enforceContractInControllers.create);
    expect(rule.meta?.schema).toBe(enforceContractInControllers.meta?.schema);
    expect(rule.meta?.messages).toBe(enforceContractInControllers.meta?.messages);
  });
});

ruleTester.run("enforce-ts-rest-in-controllers", rule, {
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
      name: "forbidTsRestHandler applies under the alias",
      code: `
        import { TsRestHandler, tsRestHandler } from "@ts-rest/nest";

        class ExampleController {
          @TsRestHandler()
          public getExample() {
            return tsRestHandler(exampleContract, async () => ({ status: 200, body: {} }));
          }
        }
      `,
      options: [{ forbidTsRestHandler: true }],
      errors: [{ messageId: "tsRestHandlerForbidden" }],
    },
  ],
});
