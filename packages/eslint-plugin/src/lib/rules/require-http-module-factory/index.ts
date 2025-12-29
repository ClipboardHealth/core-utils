/**
 * @fileoverview Rule to require HttpModule to use registerAsync factory to avoid shared axios client issues
 */
import { AST_NODE_TYPES, type TSESTree } from "@typescript-eslint/utils";

import createRule from "../../createRule";

const isHttpModuleImport = (spec: TSESTree.ImportClause): boolean =>
  spec.type === AST_NODE_TYPES.ImportSpecifier &&
  spec.imported.type === AST_NODE_TYPES.Identifier &&
  spec.imported.name === "HttpModule";

const isImportsArray = (node: TSESTree.ArrayExpression): boolean => {
  const { parent } = node;
  return (
    parent?.type === AST_NODE_TYPES.Property &&
    parent.key?.type === AST_NODE_TYPES.Identifier &&
    parent.key.name === "imports" &&
    parent.value === node
  );
};

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
      wrongPackage:
        "HttpModule must be imported from '@nestjs/axios' package. Using HttpModule from other packages may not provide the expected factory methods.",
      noImport:
        "HttpModule is used but not imported from '@nestjs/axios'. Import HttpModule and use .registerAsync() with a custom factory.",
    },
  },

  create(context) {
    let httpModuleImportedCorrectly = false;
    let httpModuleImportName: string | undefined;

    const checkHttpModuleUsage = (element: TSESTree.ArrayExpression["elements"][0]): void => {
      if (element?.type !== AST_NODE_TYPES.Identifier) {
        return;
      }

      const isDirectHttpModule = element.name === "HttpModule";
      const isAliasedHttpModule =
        httpModuleImportedCorrectly && element.name === httpModuleImportName;

      if (isDirectHttpModule) {
        const messageId = httpModuleImportedCorrectly ? "requireFactory" : "noImport";
        context.report({ node: element, messageId });
      } else if (isAliasedHttpModule) {
        context.report({ node: element, messageId: "requireFactory" });
      }
    };

    return {
      ImportDeclaration(node) {
        if (node.source.value !== "@nestjs/axios") {
          return;
        }

        for (const spec of node.specifiers) {
          if (isHttpModuleImport(spec)) {
            httpModuleImportedCorrectly = true;
            httpModuleImportName = spec.local.name;
          }
        }
      },

      ArrayExpression(node) {
        if (!isImportsArray(node)) {
          return;
        }

        for (const element of node.elements) {
          checkHttpModuleUsage(element);
        }
      },
    };
  },
});

export default rule;
