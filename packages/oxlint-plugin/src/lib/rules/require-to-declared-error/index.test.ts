import { RuleTester } from "oxlint/plugins-dev";

import rule from "./index";

RuleTester.describe = (name, run) => {
  describe(name, () => {
    run();
  });
};
RuleTester.it = it;

const ruleTester = new RuleTester({
  eslintCompat: true,
  languageOptions: {
    parserOptions: { lang: "ts" },
    sourceType: "module",
  },
});

const imports = `
import { toDeclaredError } from "@clipboard-health/api-nestjs";
import { isFailure, isSuccess } from "@clipboard-health/util-ts";
import { BadRequestException } from "@nestjs/common";
import { implement } from "@orpc/nest";
`;

function handler(body: string, options = "{ input, errors }"): string {
  return `${imports}
class Controller {
  list() {
    return implement(contract.list).handler(async (${options}) => {
      const result = await service.list(input);
${body}
      return result.value;
    });
  }
}`;
}

ruleTester.run("require-to-declared-error", rule, {
  valid: [
    {
      name: "isFailure branch throws toDeclaredError",
      code: handler(
        `if (isFailure(result)) { throw toDeclaredError({ errors, error: result.error }); }`,
      ),
    },
    {
      name: "failure branch logs before throwing toDeclaredError",
      code: handler(`if (isFailure(result)) {
        logger.error("Failed to list", { error: result.error });
        throw toDeclaredError({ errors, error: result.error });
      }`),
    },
    {
      name: "failure branch throws one of the handler's errors constructors",
      code: handler(`if (isFailure(result)) { throw errors.NOT_FOUND({ data }); }`),
    },
    {
      name: "renamed errors binding",
      code: handler(
        `if (isFailure(result)) { throw declared.CONFLICT({ data }); }`,
        "{ input, errors: declared }",
      ),
    },
    {
      name: "failure branch returns a success response",
      code: handler(`if (isFailure(result)) { return { data: [] }; }`),
    },
    {
      name: "throw outside a failure branch",
      code: handler(
        `try { await audit(); } catch (error) { throw new BadRequestException("bad"); }`,
      ),
    },
    {
      name: "success branch throws",
      code: handler(`if (isSuccess(result)) { throw new BadRequestException("bad"); }`),
    },
    {
      name: "isFailure branch outside an oRPC handler",
      code: `${imports}
async function run() {
  const result = await service.list();
  if (isFailure(result)) { throw new BadRequestException("bad"); }
}`,
    },
    {
      name: "throw in a function defined inside the failure branch",
      code: handler(`if (isFailure(result)) {
        const fail = () => { throw new Error("nested"); };
        throw toDeclaredError({ errors, error: result.error });
      }`),
    },
    {
      name: "isFailure that is not util-ts's",
      code: `
import { BadRequestException } from "@nestjs/common";
import { implement } from "@orpc/nest";
import { isFailure } from "./local";
implement(contract.list).handler(async () => {
  if (isFailure(result)) { throw new BadRequestException("bad"); }
});`,
    },
    {
      name: "handler on a contract builder that is not oRPC's implement",
      code: `
import { isFailure } from "@clipboard-health/util-ts";
import { BadRequestException } from "@nestjs/common";
builder.handler(async () => {
  if (isFailure(result)) { throw new BadRequestException("bad"); }
});`,
    },
    {
      name: "options parameter's errors constructor",
      code: handler(
        `if (isFailure(result)) { throw options.errors.NOT_FOUND({ data }); }`,
        "options",
      ),
    },
    {
      name: "else branch of an isFailure check",
      code: handler(
        `if (isFailure(result)) { return { data: [] }; } else { throw new Error("bad"); }`,
      ),
    },
    {
      name: "string-literal import name",
      code: `
import { "isFailure" as failed } from "@clipboard-health/util-ts";
import { toDeclaredError } from "@clipboard-health/api-nestjs";
import { implement } from "@orpc/nest";
implement(contract.list).handler(async ({ errors }) => {
  if (failed(result)) { throw toDeclaredError({ errors, error: result.error }); }
});`,
    },
  ],
  invalid: [
    {
      name: "isFailure branch throws an HttpException",
      code: handler(`if (isFailure(result)) { throw new BadRequestException("bad"); }`),
      errors: [{ messageId: "throwDeclaredError" }],
    },
    {
      name: "isFailure branch rethrows the ServiceError",
      code: handler(`if (isFailure(result)) { throw result.error; }`),
      errors: [{ messageId: "throwDeclaredError" }],
    },
    {
      name: "isFailure test without a block",
      code: handler(`if (isFailure(result)) throw result.error;`),
      errors: [{ messageId: "throwDeclaredError" }],
    },
    {
      name: "negated isSuccess call",
      code: handler(`if (!isSuccess(result)) { throw new BadRequestException("bad"); }`),
      errors: [{ messageId: "throwDeclaredError" }],
    },
    {
      name: "negated isSuccess property",
      code: handler(`if (!result.isSuccess) { throw new BadRequestException("bad"); }`),
      errors: [{ messageId: "throwDeclaredError" }],
    },
    {
      name: "else branch of an isSuccess property check",
      code: handler(`if (result.isSuccess) { audit(); } else { throw result.error; }`),
      errors: [{ messageId: "throwDeclaredError" }],
    },
    {
      name: "throw nested in the failure branch",
      code: handler(`if (isFailure(result)) {
        if (result.error.status === 404) { throw toDeclaredError({ errors, error: result.error }); }
        throw new BadRequestException("bad");
      }`),
      errors: [{ messageId: "throwDeclaredError" }],
    },
    {
      name: "aliased imports and a builder chain",
      code: `
import { toDeclaredError } from "@clipboard-health/api-nestjs";
import { isFailure as failed } from "@clipboard-health/util-ts";
import { implement as impl } from "@orpc/server";
impl(contract.list).use(middleware).handler(async function ({ errors }) {
  if (failed(result)) { throw new Error("bad"); }
});`,
      errors: [{ messageId: "throwDeclaredError" }],
    },
    {
      name: "else branch of an isSuccess call",
      code: handler(`if (isSuccess(result)) { audit(); } else { throw result.error; }`),
      errors: [{ messageId: "throwDeclaredError" }],
    },
    {
      name: "else branch of a negated isFailure call",
      code: handler(`if (!isFailure(result)) { audit(); } else { throw result.error; }`),
      errors: [{ messageId: "throwDeclaredError" }],
    },
    {
      name: "else-if chain under an isSuccess check",
      code: handler(`if (isSuccess(result)) { audit(); } else if (retry) { throw result.error; }`),
      errors: [{ messageId: "throwDeclaredError" }],
    },
    {
      name: "router member before handler",
      code: `
import { isFailure } from "@clipboard-health/util-ts";
import { implement } from "@orpc/nest";
implement(contract).shifts.list.handler(async () => {
  if (isFailure(result)) { throw result.error; }
});`,
      errors: [{ messageId: "throwDeclaredError" }],
    },
    {
      name: "string-literal import name",
      code: `
import { "isFailure" as failed } from "@clipboard-health/util-ts";
import { implement } from "@orpc/nest";
implement(contract.list).handler(async () => {
  if (failed(result)) { throw result.error; }
});`,
      errors: [{ messageId: "throwDeclaredError" }],
    },
    {
      name: "errors constructor from outside the handler",
      code: handler(`if (isFailure(result)) { throw otherErrors.NOT_FOUND({ data }); }`),
      errors: [{ messageId: "throwDeclaredError" }],
    },
  ],
});
