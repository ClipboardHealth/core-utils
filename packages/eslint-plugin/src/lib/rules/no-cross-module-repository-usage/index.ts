/**
 * @fileoverview Rule to prevent cross-module repository usage in NestJS applications
 */
import { AST_NODE_TYPES, type TSESTree } from "@typescript-eslint/utils";

import createRule from "../../createRule";

const isRepositoryClass = (name: string): boolean =>
  name.endsWith("Repository") || name.endsWith("Repo");




const rule = createRule({
  name: "no-cross-module-repository-usage",
  defaultOptions: [],
  meta: {
    type: "problem",
    docs: {
      description: "Prevent cross-module repository usage in NestJS applications",
    },
    schema: [],
    messages: {
      moduleExportsRepository:
        "NestJS modules should not export repository classes. Repository '{{repositoryName}}' should not be exported from module.",
    },
  },

  create(context) {
    return {
      Decorator(node) {
        if (
          node.expression.type === AST_NODE_TYPES.CallExpression &&
          node.expression.callee.type === AST_NODE_TYPES.Identifier &&
          node.expression.callee.name === "Module"
        ) {
          const moduleConfig = node.expression.arguments[0];
          if (moduleConfig?.type === AST_NODE_TYPES.ObjectExpression) {
            const exportsProperty = moduleConfig.properties.find(
              (property): property is TSESTree.Property =>
                property.type === AST_NODE_TYPES.Property &&
                property.key.type === AST_NODE_TYPES.Identifier &&
                property.key.name === "exports",
            );

            if (
              exportsProperty?.type === AST_NODE_TYPES.Property &&
              exportsProperty.value.type === AST_NODE_TYPES.ArrayExpression
            ) {
              exportsProperty.value.elements.forEach((element) => {
                if (element?.type === AST_NODE_TYPES.Identifier && isRepositoryClass(element.name)) {
                  context.report({
                    node: element,
                    messageId: "moduleExportsRepository",
                    data: { repositoryName: element.name },
                  });
                }
              });
            }
          }
        }
      },
    };
  },
});

export default rule;
