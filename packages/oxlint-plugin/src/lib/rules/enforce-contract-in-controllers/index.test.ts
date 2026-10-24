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

const forbidTsRestHandler = [{ forbidTsRestHandler: true }];

const TS_REST_CONTROLLER = `
  import { TsRestHandler, tsRestHandler } from "@ts-rest/nest";

  class ExampleController {
    @TsRestHandler()
    public getExample() {
      return tsRestHandler(exampleContract, async () => ({ status: 200, body: {} }));
    }
  }
`;

const ORPC_CONTROLLER = `
  import { Implement, implement } from "@orpc/nest";

  class ExampleController {
    @Implement(exampleContract.get)
    public getExample(@AuthPrincipal() principal: Principal, @Res() _response?: unknown) {
      return implement(exampleContract.get).handler(async ({ input }) => ({ data: input.params }));
    }
  }
`;

ruleTester.run("enforce-contract-in-controllers", rule, {
  valid: [
    {
      name: "controller method uses ts-rest imports, decorator, and handler",
      code: TS_REST_CONTROLLER,
    },
    {
      name: "controller method uses oRPC imports, decorator, and handler",
      code: ORPC_CONTROLLER,
    },
    {
      name: "oRPC handler may chain builder calls before .handler()",
      code: `
        import { Implement, implement } from "@orpc/nest";

        class ExampleController {
          @Implement(exampleContract.get)
          public getExample() {
            return implement(exampleContract.get)
              .use(authMiddleware)
              .handler(async () => ({ data: {} }));
          }
        }
      `,
    },
    {
      name: "one controller may mix ts-rest and oRPC methods while it migrates",
      code: `
        import { Implement, implement } from "@orpc/nest";
        import { TsRestHandler, tsRestHandler } from "@ts-rest/nest";

        class ExampleController {
          @TsRestHandler()
          public getLegacy() {
            return tsRestHandler(legacyContract, async () => ({ status: 200, body: {} }));
          }

          @Implement(exampleContract.get)
          public getExample() {
            return implement(exampleContract.get).handler(async () => ({ data: {} }));
          }
        }
      `,
    },
    {
      name: "explicitly disabled forbidTsRestHandler keeps accepting ts-rest",
      code: TS_REST_CONTROLLER,
      options: [{ forbidTsRestHandler: false }],
    },
    {
      name: "forbidTsRestHandler accepts oRPC handlers",
      code: ORPC_CONTROLLER,
      options: forbidTsRestHandler,
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
      name: "controller method omits a contract decorator and handler return",
      code: `
        class ExampleController {
          public getExample() {
            return {};
          }
        }
      `,
      errors: [
        {
          message:
            "Controller method 'getExample' must be decorated with `@TsRestHandler()` from `@ts-rest/nest` or `@Implement()` from `@orpc/nest`. See https://www.notion.so/BP-REST-API-f769b7fe745c4cf38f6eca2e9ad8a843 for more information.",
        },
        {
          message:
            "Controller method 'getExample' must only return the result of calling `tsRestHandler(…)` from `@ts-rest/nest` or `implement(…).handler(…)` from `@orpc/nest`. See https://www.notion.so/BP-REST-API-f769b7fe745c4cf38f6eca2e9ad8a843 for more information.",
        },
      ],
    },
    {
      name: "a plain Nest route without a contract is reported",
      code: `
        import { Get } from "@nestjs/common";

        class MetricsController {
          @Get()
          public getMetrics(): string {
            try {
              return this.metricsService.status();
            } catch {
              return "unavailable";
            }
          }
        }
      `,
      errors: [{ messageId: "missingDecorator" }, { messageId: "missingReturn" }],
    },
    {
      name: "an undecorated method that returns a handler still needs its decorator",
      code: `
        import { implement } from "@orpc/nest";

        class ExampleController {
          public getExample() {
            return implement(exampleContract.get).handler(async () => ({ data: {} }));
          }
        }
      `,
      errors: [{ messageId: "missingDecorator" }],
    },
    {
      name: "ts-rest symbols must be imported from @ts-rest/nest",
      code: `
        import { TsRestHandler, tsRestHandler } from "somewhere-else";

        class ExampleController {
          @TsRestHandler()
          public getExample() {
            return tsRestHandler(exampleContract, async () => ({ status: 200, body: {} }));
          }
        }
      `,
      errors: [
        {
          message: "Decorator `TsRestHandler` must be imported from `@ts-rest/nest`",
        },
        {
          message: "Method `tsRestHandler` must be imported from `@ts-rest/nest`",
        },
      ],
    },
    {
      name: "oRPC symbols must be imported from @orpc/nest",
      code: `
        import { Implement, implement } from "@orpc/server";

        class ExampleController {
          @Implement(exampleContract.get)
          public getExample() {
            return implement(exampleContract.get).handler(async () => ({ data: {} }));
          }
        }
      `,
      errors: [
        {
          message: "Decorator `Implement` must be imported from `@orpc/nest`",
        },
        {
          message: "Method `implement` must be imported from `@orpc/nest`",
        },
      ],
    },
    {
      name: "the ts-rest handler call must be the method's only statement",
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
    {
      name: "the oRPC handler call must be the method's only statement",
      code: `
        import { Implement, implement } from "@orpc/nest";

        class ExampleController {
          @Implement(exampleContract.get)
          public getExample() {
            logRequest();
            return implement(exampleContract.get).handler(async () => ({ data: {} }));
          }
        }
      `,
      errors: [
        {
          message:
            "Controller method 'getExample' must only return the result of calling `implement(…).handler(…)` from `@orpc/nest`. See https://www.notion.so/BP-REST-API-f769b7fe745c4cf38f6eca2e9ad8a843 for more information.",
        },
      ],
    },
    {
      name: "an oRPC method must return the built handler, not the implementer",
      code: `
        import { Implement, implement } from "@orpc/nest";

        class ExampleController {
          @Implement(exampleContract.get)
          public getExample() {
            return implement(exampleContract.get);
          }
        }
      `,
      errors: [{ messageId: "missingReturn" }],
    },
    {
      name: "an oRPC method's .handler() must be called on implement(…)",
      code: `
        import { Implement } from "@orpc/nest";

        class ExampleController {
          @Implement(exampleContract.get)
          public getExample() {
            return os.handler(async () => ({ data: {} }));
          }
        }
      `,
      errors: [{ messageId: "missingReturn" }],
    },
    {
      name: "the decorator and handler must come from the same library",
      code: `
        import { implement } from "@orpc/nest";
        import { TsRestHandler } from "@ts-rest/nest";

        class ExampleController {
          @TsRestHandler()
          public getExample() {
            return implement(exampleContract.get).handler(async () => ({ data: {} }));
          }
        }
      `,
      errors: [{ messageId: "missingReturn" }],
    },
    {
      name: "a method cannot use both decorators",
      code: `
        import { Implement, implement } from "@orpc/nest";
        import { TsRestHandler } from "@ts-rest/nest";

        class ExampleController {
          @TsRestHandler()
          @Implement(exampleContract.get)
          public getExample() {
            return implement(exampleContract.get).handler(async () => ({ data: {} }));
          }
        }
      `,
      errors: [{ messageId: "conflictingDecorators" }],
    },
    {
      name: "forbidTsRestHandler rejects ts-rest handlers",
      code: TS_REST_CONTROLLER,
      options: forbidTsRestHandler,
      errors: [
        {
          message:
            "Controller method 'getExample' must implement its route with oRPC's `@Implement()` and `implement(…).handler(…)` from `@orpc/nest`; this repository no longer accepts ts-rest handlers.",
        },
      ],
    },
    {
      name: "forbidTsRestHandler names only oRPC for an undecorated method",
      code: `
        import { tsRestHandler } from "@ts-rest/nest";

        class ExampleController {
          public getExample() {
            return tsRestHandler(exampleContract, async () => ({ status: 200, body: {} }));
          }
        }
      `,
      options: forbidTsRestHandler,
      errors: [
        {
          message:
            "Controller method 'getExample' must be decorated with `@Implement()` from `@orpc/nest`. See https://www.notion.so/BP-REST-API-f769b7fe745c4cf38f6eca2e9ad8a843 for more information.",
        },
        {
          message:
            "Controller method 'getExample' must only return the result of calling `implement(…).handler(…)` from `@orpc/nest`. See https://www.notion.so/BP-REST-API-f769b7fe745c4cf38f6eca2e9ad8a843 for more information.",
        },
      ],
    },
  ],
});
