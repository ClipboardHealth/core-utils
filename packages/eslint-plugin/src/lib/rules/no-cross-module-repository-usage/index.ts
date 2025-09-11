/**
 * @fileoverview Rule to prevent cross-module repository usage in NestJS applications
 */
import { AST_NODE_TYPES, type TSESTree } from "@typescript-eslint/utils";
import type { RuleContext } from "@typescript-eslint/utils/ts-eslint";

import createRule from "../../createRule";

const isRepositoryClass = (name: string): boolean =>
  name.endsWith("Repository") || name.includes("Repo");

const isRepositoryFile = (filePath: string): boolean =>
  filePath.endsWith(".repo.ts") || filePath.endsWith(".repository.ts");

const checkModuleExports = (
  moduleConfig: TSESTree.ObjectExpression,
  context: RuleContext<string, readonly unknown[]>,
) => {
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
};

const checkInjectDecorator = (
  node: TSESTree.Decorator,
  repositoryImports: Map<string, string>,
  context: RuleContext<string, readonly unknown[]>,
) => {
  if (node.expression.type === AST_NODE_TYPES.CallExpression) {
    const injectArgument = node.expression.arguments[0];
    if (
      injectArgument?.type === AST_NODE_TYPES.Identifier &&
      isRepositoryClass(injectArgument.name) &&
      repositoryImports.has(injectArgument.name)
    ) {
      context.report({
        node: injectArgument,
        messageId: "crossModuleRepositoryInjection",
        data: { repositoryName: injectArgument.name },
      });
    }
  }
};

const checkConstructorParameter = (
  parameter_: TSESTree.Parameter,
  repositoryImports: Map<string, string>,
  context: RuleContext<string, readonly unknown[]>,
) => {
  if (parameter_.type === AST_NODE_TYPES.TSParameterProperty) {
    const { parameter } = parameter_;
    if (
      parameter.type === AST_NODE_TYPES.Identifier &&
      parameter.typeAnnotation?.type === AST_NODE_TYPES.TSTypeAnnotation &&
      parameter.typeAnnotation.typeAnnotation.type === AST_NODE_TYPES.TSTypeReference &&
      parameter.typeAnnotation.typeAnnotation.typeName.type === AST_NODE_TYPES.Identifier
    ) {
      const typeName = parameter.typeAnnotation.typeAnnotation.typeName.name;
      if (isRepositoryClass(typeName) && repositoryImports.has(typeName)) {
        context.report({
          node: parameter,
          messageId: "crossModuleRepositoryInjection",
          data: { repositoryName: typeName },
        });
      }
    }
  }
};

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
      crossModuleRepositoryImport:
        "Repository '{{repositoryName}}' from '{{importPath}}' should not be imported from a different module. Repositories should only be used within their own module.",
      crossModuleRepositoryInjection:
        "Repository '{{repositoryName}}' should not be injected from a different module. Repositories should only be used within their own module.",
    },
  },

  create(context) {
    const repositoryImports = new Map<string, string>(); // name -> import path
    let isModuleFile = false;

    return {
      Decorator(node) {
        if (
          node.expression.type === AST_NODE_TYPES.CallExpression &&
          node.expression.callee.type === AST_NODE_TYPES.Identifier
        ) {
          if (node.expression.callee.name === "Module") {
            isModuleFile = true;
            const moduleConfig = node.expression.arguments[0];
            if (moduleConfig?.type === AST_NODE_TYPES.ObjectExpression) {
              checkModuleExports(moduleConfig, context);
            }
          }

          if (node.expression.callee.name === "Inject" && !isModuleFile) {
            checkInjectDecorator(node, repositoryImports, context);
          }
        }
      },

      ImportDeclaration(node) {
        const importPath = node.source.value;
        if (isRepositoryFile(importPath) || importPath.includes("repository")) {
          node.specifiers.forEach((spec) => {
            if (
              spec.type === AST_NODE_TYPES.ImportSpecifier &&
              spec.imported.type === AST_NODE_TYPES.Identifier &&
              isRepositoryClass(spec.imported.name)
            ) {
              repositoryImports.set(spec.local.name, importPath);

              if (!isModuleFile) {
                context.report({
                  node: spec,
                  messageId: "crossModuleRepositoryImport",
                  data: {
                    repositoryName: spec.imported.name,
                    importPath,
                  },
                });
              }
            }
          });
        }
      },

      MethodDefinition(node) {
        if (
          node.kind === "constructor" &&
          node.value.type === AST_NODE_TYPES.FunctionExpression &&
          !isModuleFile
        ) {
          node.value.params.forEach((parameter_) => {
            checkConstructorParameter(parameter_, repositoryImports, context);
          });
        }
      },
    };
  },
});

export default rule;
