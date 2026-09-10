/**
 * @fileoverview Rule to require HttpModule to use registerAsync factory to avoid shared axios client issues
 */
import { defineRule, type ESTree } from "@oxlint/plugins";

function isHttpModuleImport(specifier: ESTree.ImportDeclarationSpecifier): boolean {
  return (
    specifier.type === "ImportSpecifier" &&
    specifier.imported.type === "Identifier" &&
    specifier.imported.name === "HttpModule"
  );
}

function isImportsArray(node: ESTree.ArrayExpression): boolean {
  const { parent } = node;
  return (
    parent?.type === "Property" &&
    parent.key.type === "Identifier" &&
    parent.key.name === "imports" &&
    parent.value === node
  );
}

const rule = defineRule({
  meta: {
    type: "problem",
    docs: {
      description:
        "Require HttpModule to use registerAsync factory to avoid shared axios client issues",
      url: "https://github.com/ClipboardHealth/core-utils/tree/main/packages/eslint-plugin/src/lib/rules/require-http-module-factory",
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

    function checkHttpModuleUsage(element: ESTree.ArrayExpressionElement): void {
      if (element?.type !== "Identifier") {
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
    }

    return {
      ImportDeclaration(node) {
        if (node.source.value !== "@nestjs/axios") {
          return;
        }

        for (const specifier of node.specifiers) {
          if (isHttpModuleImport(specifier)) {
            httpModuleImportedCorrectly = true;
            httpModuleImportName = specifier.local.name;
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
