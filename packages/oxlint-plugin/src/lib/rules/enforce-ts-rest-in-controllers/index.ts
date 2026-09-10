import { type Context, defineRule, type ESTree } from "@oxlint/plugins";

type MessageId =
  | "missingDecorator"
  | "missingReturn"
  | "decoratorNotFromPackage"
  | "callNotFromPackage";

function validateDecorators(
  context: Context,
  node: ESTree.MethodDefinition,
  symbolName: string,
  decoratorImportedCorrectly: boolean,
): void {
  const decorators = node.decorators ?? [];
  const hasMatchingDecorator = decorators.some(
    (decorator) =>
      decorator.expression.type === "CallExpression" &&
      decorator.expression.callee.type === "Identifier" &&
      decorator.expression.callee.name === "TsRestHandler",
  );

  if (!hasMatchingDecorator) {
    context.report({
      node,
      messageId: "missingDecorator" satisfies MessageId,
      data: { name: symbolName },
    });
  }

  for (const decorator of decorators) {
    if (
      decorator.expression.type === "CallExpression" &&
      decorator.expression.callee.type === "Identifier" &&
      decorator.expression.callee.name === "TsRestHandler" &&
      !decoratorImportedCorrectly
    ) {
      context.report({
        node: decorator,
        messageId: "decoratorNotFromPackage" satisfies MessageId,
      });
    }
  }
}

function validateReturnStatement(
  context: Context,
  node: ESTree.MethodDefinition,
  symbolName: string,
  methodImportedCorrectly: boolean,
): void {
  const body = node.value.body;
  if (
    body?.type !== "BlockStatement" ||
    body.body.length !== 1 ||
    body.body[0]?.type !== "ReturnStatement"
  ) {
    context.report({
      node,
      messageId: "missingReturn" satisfies MessageId,
      data: { name: symbolName },
    });
    return;
  }

  const returnValueExpression = body.body[0].argument;
  if (
    returnValueExpression?.type !== "CallExpression" ||
    returnValueExpression.callee.type !== "Identifier" ||
    returnValueExpression.callee.name !== "tsRestHandler"
  ) {
    context.report({
      node,
      messageId: "missingReturn" satisfies MessageId,
      data: { name: symbolName },
    });
  }

  if (
    returnValueExpression?.type === "CallExpression" &&
    returnValueExpression.callee.type === "Identifier" &&
    returnValueExpression.callee.name === "tsRestHandler" &&
    !methodImportedCorrectly
  ) {
    context.report({
      node: returnValueExpression,
      messageId: "callNotFromPackage" satisfies MessageId,
    });
  }
}

const rule = defineRule({
  meta: {
    type: "problem",
    docs: {
      description: "Require use of ts-rest on all controller methods",
      url: "https://github.com/ClipboardHealth/core-utils/tree/main/packages/eslint-plugin/src/lib/rules/enforce-ts-rest-in-controllers",
    },
    schema: [],
    messages: {
      missingDecorator:
        "Controller method '{{name}}' must be decorated with `@TsRestHandler()` from `@ts-rest/nest` package. See https://www.notion.so/BP-REST-API-f769b7fe745c4cf38f6eca2e9ad8a843 for more information.",
      missingReturn:
        "Controller method '{{name}}' must only return the result of calling `tsRestHandler()` from `@ts-rest/nest` package. See https://www.notion.so/BP-REST-API-f769b7fe745c4cf38f6eca2e9ad8a843 for more information.",
      decoratorNotFromPackage: "Decorator `TsRestHandler` must be imported from `@ts-rest/nest`",
      callNotFromPackage: "Method `tsRestHandler` must be imported from `@ts-rest/nest`",
    },
  },
  create(context) {
    let methodImportedCorrectly = false;
    let decoratorImportedCorrectly = false;

    return {
      ImportDeclaration(node) {
        if (node.source.value !== "@ts-rest/nest") {
          return;
        }

        for (const specifier of node.specifiers) {
          if (specifier.type !== "ImportSpecifier") {
            continue;
          }

          if (
            specifier.imported.type === "Identifier" &&
            specifier.imported.name === "tsRestHandler"
          ) {
            methodImportedCorrectly = true;
          }

          if (
            specifier.imported.type === "Identifier" &&
            specifier.imported.name === "TsRestHandler"
          ) {
            decoratorImportedCorrectly = true;
          }
        }
      },

      MethodDefinition(node) {
        const symbolName = node.key.type === "Identifier" ? node.key.name : "<unknown>";
        if (
          node.kind === "constructor" ||
          node.accessibility === "private" ||
          (node.key.type === "Identifier" && node.key.name === "constructor")
        ) {
          return;
        }

        validateDecorators(context, node, symbolName, decoratorImportedCorrectly);
        validateReturnStatement(context, node, symbolName, methodImportedCorrectly);
      },
    };
  },
});

export default rule;
