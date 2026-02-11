/**
 * @fileoverview Rule to require controller methods to use ts-rest as per our best practices on backend REST APIs
 */
import { AST_NODE_TYPES } from "@typescript-eslint/utils";

import { createRule } from "../../createRule";

const rule = createRule({
  name: "enforce-ts-rest-in-controllers",
  defaultOptions: [],
  meta: {
    type: "problem",
    docs: {
      description: "Require use of ts-rest on all controller methods",
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
      /*
       * This method iterates through import declarations and verifies that the the `TsRestHandler`
       * decorator and `tsRestHandler` method are imported from `@ts-rest/nest` package. We'll use
       * this information to later highlight usages of those symbols to point out that they need to
       * be imported from the correct source.
       */
      ImportDeclaration(node) {
        if (node.source.value === "@ts-rest/nest") {
          for (const spec of node.specifiers) {
            if (spec.type === AST_NODE_TYPES.ImportSpecifier) {
              if (
                spec.imported.type === AST_NODE_TYPES.Identifier &&
                spec.imported.name === "tsRestHandler"
              ) {
                methodImportedCorrectly = true;
              }

              if (
                spec.imported.type === AST_NODE_TYPES.Identifier &&
                spec.imported.name === "TsRestHandler"
              ) {
                decoratorImportedCorrectly = true;
              }
            }
          }
        }
      },

      /*
       * This method verifies that non-constructor and non-private methods use the
       * `TsRestHandler` decorator and return the result of `tsRestHandler` as the
       * only expression in it.
       */
      MethodDefinition(node) {
        const symbolName =
          (node.key.type === AST_NODE_TYPES.Identifier && node.key.name) || "<unknown>";
        // Ignore this rule for constructor and private methods
        if (
          node.kind === "constructor" ||
          node.accessibility === "private" ||
          (node.key.type === AST_NODE_TYPES.Identifier && node.key.name === "constructor")
        ) {
          return;
        }

        // Check for use of `@TsRestHandler()` decorator and ensure it comes from `@ts-rest/nest` package
        const decorators = node.decorators || [];
        const hasMatchingDecorator = decorators.some(
          (decorator) =>
            decorator.expression.type === AST_NODE_TYPES.CallExpression &&
            decorator.expression.callee.type === AST_NODE_TYPES.Identifier &&
            decorator.expression.callee.name === "TsRestHandler",
        );

        if (!hasMatchingDecorator) {
          context.report({
            node,
            messageId: "missingDecorator",
            data: {
              name: symbolName,
            },
          });
        }

        decorators.forEach((decorator) => {
          if (
            decorator.expression.type === AST_NODE_TYPES.CallExpression &&
            decorator.expression.callee.type === AST_NODE_TYPES.Identifier &&
            decorator.expression.callee.name === "TsRestHandler" &&
            !decoratorImportedCorrectly
          ) {
            context.report({
              node: decorator,
              messageId: "decoratorNotFromPackage",
            });
          }
        });

        // Check for returning the result of `tsRestHandler()` method (without any other statement present), and ensure it comes from `@ts-rest/nest` package
        const body = node.value?.body;
        if (
          body?.type !== AST_NODE_TYPES.BlockStatement ||
          body.body.length !== 1 ||
          body.body[0]?.type !== AST_NODE_TYPES.ReturnStatement
        ) {
          context.report({
            node,
            messageId: "missingReturn",
            data: {
              name: symbolName,
            },
          });
          return;
        }

        const returnValueExpr = body.body[0].argument;
        if (
          returnValueExpr?.type !== AST_NODE_TYPES.CallExpression ||
          returnValueExpr.callee.type !== AST_NODE_TYPES.Identifier ||
          returnValueExpr.callee.name !== "tsRestHandler"
        ) {
          context.report({
            node,
            messageId: "missingReturn",
            data: {
              name: symbolName,
            },
          });
        }

        if (
          returnValueExpr &&
          returnValueExpr?.type === AST_NODE_TYPES.CallExpression &&
          returnValueExpr.callee.type === AST_NODE_TYPES.Identifier &&
          returnValueExpr.callee.name === "tsRestHandler" &&
          !methodImportedCorrectly
        ) {
          context.report({
            node: returnValueExpr,
            messageId: "callNotFromPackage",
          });
        }
      },
    };
  },
});

export default rule;
