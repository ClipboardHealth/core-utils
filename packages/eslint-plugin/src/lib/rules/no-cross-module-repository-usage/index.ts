/**
 * @fileoverview Rule to prevent cross-module repository usage in NestJS applications
 */
import * as path from "node:path";

import { AST_NODE_TYPES, type TSESTree } from "@typescript-eslint/utils";
import type { RuleContext } from "@typescript-eslint/utils/dist/ts-eslint";

import createRule from "../../createRule";

const isRepositoryClass = (name: string): boolean =>
  name.endsWith("Repository") || name.endsWith("Repo");

const isRepositoryFile = (filePath: string): boolean => {
  const basename = path.basename(filePath, path.extname(filePath));
  return (
    basename.endsWith(".repository") ||
    basename.endsWith(".repo") ||
    filePath.endsWith(".repository.ts") ||
    filePath.endsWith(".repo.ts")
  );
};

const isRepositoryImportPath = (importPath: string): boolean => {
  const segments = importPath.split("/");
  return (
    segments.some(
      (segment) =>
        segment === "repository" ||
        segment === "repositories" ||
        segment.endsWith(".repository") ||
        segment.endsWith(".repo"),
    ) || isRepositoryFile(importPath)
  );
};

const getModuleDirectory = (filePath: string): string => {
  const parts = filePath.split("/");
  const moduleIndex = parts.indexOf("modules");
  if (moduleIndex !== -1 && moduleIndex + 1 < parts.length) {
    return parts.slice(0, moduleIndex + 2).join("/");
  }

  return path.dirname(filePath);
};

const isCrossModuleImport = (currentFilePath: string, importPath: string): boolean => {
  if (importPath.startsWith("./")) {
    return false;
  }

  if (importPath.startsWith("../")) {
    const resolvedPath = path.resolve(path.dirname(currentFilePath), importPath);
    const currentModuleDirectory = getModuleDirectory(currentFilePath);
    const importModuleDirectory = getModuleDirectory(resolvedPath);
    return currentModuleDirectory !== importModuleDirectory;
  }

  return true;
};

const checkModuleExports = (
  moduleConfig: TSESTree.ObjectExpression,
  context: RuleContext<
    "moduleExportsRepository" | "crossModuleRepositoryImport" | "crossModuleRepositoryInjection",
    never[]
  >,
): void => {
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
  currentFilePath: string,
  context: RuleContext<
    "moduleExportsRepository" | "crossModuleRepositoryImport" | "crossModuleRepositoryInjection",
    never[]
  >,
): void => {
  if (node.expression.type === AST_NODE_TYPES.CallExpression) {
    const injectArgument = node.expression.arguments[0];
    if (
      injectArgument?.type === AST_NODE_TYPES.Identifier &&
      isRepositoryClass(injectArgument.name) &&
      repositoryImports.has(injectArgument.name)
    ) {
      const importPath = repositoryImports.get(injectArgument.name)!;
      if (isCrossModuleImport(currentFilePath, importPath)) {
        context.report({
          node: injectArgument,
          messageId: "crossModuleRepositoryInjection",
          data: { repositoryName: injectArgument.name },
        });
      }
    }
  }
};

const checkTSParameterProperty = (
  parameter: TSESTree.TSParameterProperty,
  repositoryImports: Map<string, string>,
  currentFilePath: string,
  context: RuleContext<
    "moduleExportsRepository" | "crossModuleRepositoryImport" | "crossModuleRepositoryInjection",
    never[]
  >,
): void => {
  const { parameter: parameter_ } = parameter;
  if (
    parameter_.type === AST_NODE_TYPES.Identifier &&
    parameter_.typeAnnotation?.type === AST_NODE_TYPES.TSTypeAnnotation &&
    parameter_.typeAnnotation.typeAnnotation.type === AST_NODE_TYPES.TSTypeReference &&
    parameter_.typeAnnotation.typeAnnotation.typeName.type === AST_NODE_TYPES.Identifier
  ) {
    const typeName = parameter_.typeAnnotation.typeAnnotation.typeName.name;
    if (isRepositoryClass(typeName) && repositoryImports.has(typeName)) {
      const importPath = repositoryImports.get(typeName)!;
      if (isCrossModuleImport(currentFilePath, importPath)) {
        context.report({
          node: parameter_,
          messageId: "crossModuleRepositoryInjection",
          data: { repositoryName: typeName },
        });
      }
    }
  }
};

const checkRegularParameter = (
  parameter: TSESTree.Identifier,
  repositoryImports: Map<string, string>,
  currentFilePath: string,
  context: RuleContext<
    "moduleExportsRepository" | "crossModuleRepositoryImport" | "crossModuleRepositoryInjection",
    never[]
  >,
): void => {
  if (parameter.decorators) {
    parameter.decorators.forEach((decorator) => {
      if (
        decorator.expression.type === AST_NODE_TYPES.CallExpression &&
        decorator.expression.callee.type === AST_NODE_TYPES.Identifier &&
        decorator.expression.callee.name === "Inject"
      ) {
        checkInjectDecorator(decorator, repositoryImports, currentFilePath, context);
      }
    });
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
    const repositoryImports = new Map<string, string>();
    const currentFilePath = context.getFilename();
    let hasModuleDecorator = false;

    return {
      Program(node) {
        repositoryImports.clear();
        hasModuleDecorator = false;

        const hasModule = (astNode: TSESTree.Node): boolean => {
          if (
            astNode.type === AST_NODE_TYPES.Decorator &&
            astNode.expression.type === AST_NODE_TYPES.CallExpression &&
            astNode.expression.callee.type === AST_NODE_TYPES.Identifier &&
            astNode.expression.callee.name === "Module"
          ) {
            return true;
          }

          if ("body" in astNode && Array.isArray(astNode.body)) {
            return astNode.body.some(hasModule);
          }

          if ("decorators" in astNode && Array.isArray(astNode.decorators)) {
            return astNode.decorators.some(hasModule);
          }

          return false;
        };

        hasModuleDecorator = hasModule(node);
      },

      Decorator(node) {
        if (
          node.expression.type === AST_NODE_TYPES.CallExpression &&
          node.expression.callee.type === AST_NODE_TYPES.Identifier &&
          node.expression.callee.name === "Module"
        ) {
          const moduleConfig = node.expression.arguments[0];
          if (moduleConfig?.type === AST_NODE_TYPES.ObjectExpression) {
            checkModuleExports(moduleConfig, context);
          }
        }

        if (
          node.expression.type === AST_NODE_TYPES.CallExpression &&
          node.expression.callee.type === AST_NODE_TYPES.Identifier &&
          node.expression.callee.name === "Inject" &&
          !hasModuleDecorator
        ) {
          checkInjectDecorator(node, repositoryImports, currentFilePath, context);
        }
      },

      ImportDeclaration(node) {
        const importPath = node.source.value;
        if (isRepositoryImportPath(importPath)) {
          node.specifiers.forEach((spec) => {
            if (
              spec.type === AST_NODE_TYPES.ImportSpecifier &&
              spec.imported.type === AST_NODE_TYPES.Identifier &&
              isRepositoryClass(spec.imported.name)
            ) {
              repositoryImports.set(spec.local.name, importPath);

              if (!hasModuleDecorator && isCrossModuleImport(currentFilePath, importPath)) {
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
          !hasModuleDecorator
        ) {
          node.value.params.forEach((parameter_) => {
            if (parameter_.type === AST_NODE_TYPES.TSParameterProperty) {
              checkTSParameterProperty(parameter_, repositoryImports, currentFilePath, context);
            } else if (parameter_.type === AST_NODE_TYPES.Identifier) {
              checkRegularParameter(parameter_, repositoryImports, currentFilePath, context);
            }
          });
        }
      },
    };
  },
});

export default rule;
