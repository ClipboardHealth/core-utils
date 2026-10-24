## enforce-ts-rest-in-controllers

This rule requires every NestJS controller method to implement a contract route, with either ts-rest
or oRPC. A controller can mix both styles while its routes move from ts-rest to oRPC.

Each controller method other than a constructor or a `private` method must use one of these styles:

- **ts-rest:** decorate the method with `@TsRestHandler()`, and make its only statement
  `return tsRestHandler(…)`. Import both from `@ts-rest/nest`.
- **oRPC:** decorate the method with `@Implement()`, and make its only statement
  `return implement(…).handler(…)`. Builder calls such as `.use(…)` may come between `implement(…)`
  and `.handler(…)`. Import both from `@orpc/nest`.

```ts
import { Implement, implement } from "@orpc/nest";
import { TsRestHandler, tsRestHandler } from "@ts-rest/nest";

@Controller()
export class ExampleController {
  @TsRestHandler(contract.legacy)
  public getLegacy() {
    return tsRestHandler(contract.legacy, async () => ({ status: 200, body: {} }));
  }

  @Implement(contract.get)
  public get() {
    return implement(contract.get).handler(async ({ input }) => ({ data: input.params }));
  }
}
```

See [BP: REST API](https://www.notion.so/BP-REST-API-f769b7fe745c4cf38f6eca2e9ad8a843) for more information.

### Options

- `forbidTsRestHandler` (default `false`): reject `@TsRestHandler` and accept only oRPC's
  `@Implement`. Enable it once a repository has migrated every route to oRPC, so new ts-rest
  handlers aren't added.

The shared `customRules` preset in `@clipboard-health/oxlint-config` enables this rule for
`*.controller.ts` and `*.controllers.ts` files. To turn on the option, override the rule for the same
files:

```ts
overrides: [
  {
    files: ["**/*.controller.ts", "**/*.controllers.ts"],
    rules: {
      "@clipboard-health/enforce-ts-rest-in-controllers": ["error", { forbidTsRestHandler: true }],
    },
  },
],
```
