/**
 * @fileoverview Rule to require HttpModule to use registerAsync factory to avoid shared axios client issues
 */
import { AST_NODE_TYPES } from "@typescript-eslint/utils";

import createRule from "../../createRule";

const rule = createRule({
  name: "require-http-module-factory",
  defaultOptions: [],
  meta: {
    type: "problem",
    docs: {
      description:
        "Require HttpModule to use registerAsync factory to avoid shared axios client issues",
    },
    schema: [],
    messages: {
      requireFactory:
        "HttpModule must use .registerAsync() with a custom factory to create a new axios client instance. Direct HttpModule imports share the global axios client and can cause interceptor conflicts.",
    },
  },

  create(context) {
    let httpModuleImportName: string | undefined = null;

    return {
      ImportDeclaration(node) {
        if (node.source.value === "@nestjs/axios") {
          for (const spec of node.specifiers) {
            if (
              spec.type === AST_NODE_TYPES.ImportSpecifier &&
              spec.imported.type === AST_NODE_TYPES.Identifier &&
              spec.imported.name === "HttpModule"
            ) {
              httpModuleImportName = spec.local.name;
            }
          }
        }
      },

      ArrayExpression(node) {
        if (!httpModuleImportName) {
          return;
        }

        const { parent } = node;
        if (
          parent?.type === AST_NODE_TYPES.Property &&
          parent.key?.type === AST_NODE_TYPES.Identifier &&
          parent.key.name === "imports"
        ) {
          const { value } = parent;
          if (value === node) {
            const { elements } = node;
            for (const element of elements) {
              if (
                element &&
                element.type === AST_NODE_TYPES.Identifier &&
                element.name === httpModuleImportName
              ) {
                context.report({
                  node: element,
                  messageId: "requireFactory",
                });
              }
            }
          }
        }
      },
    };
  },
});

export default rule;
