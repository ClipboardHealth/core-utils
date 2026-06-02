/**
 * @fileoverview Rule to forbid catches that silently swallow invariant guard failures
 */
import { AST_NODE_TYPES, type TSESLint, type TSESTree } from "@typescript-eslint/utils";

import { createRule } from "../../createRule";

const GUARD_NAME_PREFIXES = ["ensure", "assert", "throwIf", "validate", "verify"] as const;

const EXPLICIT_VIOLATION_HELPER_PREFIXES = ["record", "report"] as const;

const NESTED_EXECUTABLE_BOUNDARY_NODE_TYPES = new Set<AST_NODE_TYPES>([
  AST_NODE_TYPES.ArrowFunctionExpression,
  AST_NODE_TYPES.ClassDeclaration,
  AST_NODE_TYPES.ClassExpression,
  AST_NODE_TYPES.FunctionDeclaration,
  AST_NODE_TYPES.FunctionExpression,
  AST_NODE_TYPES.TSDeclareFunction,
  AST_NODE_TYPES.TSEmptyBodyFunctionExpression,
]);

type VisitorKeys = TSESLint.SourceCode["visitorKeys"];

const rule = createRule({
  name: "no-swallowed-invariant-guard",
  defaultOptions: [],
  meta: {
    type: "problem",
    docs: {
      description: "Forbid catches that silently swallow invariant guard failures",
    },
    schema: [],
    messages: {
      swallowedGuard:
        "This `catch` swallows a failed invariant guard (`{{functionName}}`) and continues. Rethrow, or record the violation explicitly — do not log-and-continue (cf. inc-406).",
    },
  },

  create(context) {
    return {
      TryStatement(node) {
        if (!node.handler) {
          return;
        }

        const guardFunctionName = findGuardFunctionName(node.block, context.sourceCode.visitorKeys);
        if (!guardFunctionName) {
          return;
        }

        if (catchHandlesGuardFailure(node.handler, context.sourceCode.visitorKeys)) {
          return;
        }

        context.report({
          node: node.handler,
          messageId: "swallowedGuard",
          data: { functionName: guardFunctionName },
        });
      },
    };
  },
});

export default rule;

function findGuardFunctionName(
  block: TSESTree.BlockStatement,
  visitorKeys: VisitorKeys,
): string | undefined {
  let guardFunctionName: string | undefined;

  findDescendant(block, visitorKeys, (node) => {
    if (node.type !== AST_NODE_TYPES.CallExpression) {
      return false;
    }

    const functionName = getCallTargetName(node);
    if (!functionName || !isGuardFunctionName(functionName)) {
      return false;
    }

    guardFunctionName = functionName;
    return true;
  });

  return guardFunctionName;
}

function catchHandlesGuardFailure(
  catchClause: TSESTree.CatchClause,
  visitorKeys: VisitorKeys,
): boolean {
  return (
    containsExplicitViolationHelperCall(catchClause.body, visitorKeys) ||
    blockGuaranteesErrorExit(catchClause.body)
  );
}

function containsExplicitViolationHelperCall(
  block: TSESTree.BlockStatement,
  visitorKeys: VisitorKeys,
): boolean {
  return Boolean(
    findDescendant(block, visitorKeys, (node) => {
      if (node.type !== AST_NODE_TYPES.CallExpression) {
        return false;
      }

      const functionName = getCallTargetName(node);
      return Boolean(functionName && isExplicitViolationHelperName(functionName));
    }),
  );
}

function blockGuaranteesErrorExit(block: TSESTree.BlockStatement): boolean {
  return block.body.some((statement) => statementGuaranteesErrorExit(statement));
}

function statementGuaranteesErrorExit(statement: TSESTree.Statement): boolean {
  if (statement.type === AST_NODE_TYPES.ThrowStatement) {
    return true;
  }

  if (statement.type === AST_NODE_TYPES.ReturnStatement) {
    return Boolean(statement.argument && isErrorLikeExpression(statement.argument));
  }

  if (statement.type === AST_NODE_TYPES.BlockStatement) {
    return blockGuaranteesErrorExit(statement);
  }

  if (statement.type === AST_NODE_TYPES.IfStatement) {
    return Boolean(
      statement.alternate &&
      statementGuaranteesErrorExit(statement.consequent) &&
      statementGuaranteesErrorExit(statement.alternate),
    );
  }

  return false;
}

function isErrorLikeExpression(expression: TSESTree.Expression): boolean {
  if (expression.type === AST_NODE_TYPES.Identifier) {
    return isErrorLikeName(expression.name);
  }

  if (expression.type === AST_NODE_TYPES.CallExpression) {
    return isErrorLikeCallExpression(expression);
  }

  if (expression.type === AST_NODE_TYPES.NewExpression) {
    const constructedName = getConstructedName(expression);
    return Boolean(constructedName && isErrorLikeName(constructedName));
  }

  if (expression.type === AST_NODE_TYPES.ObjectExpression) {
    return expression.properties.some((property) => {
      if (property.type !== AST_NODE_TYPES.Property) {
        return false;
      }

      const propertyName = getPropertyName(property);
      return Boolean(propertyName && isErrorLikeName(propertyName));
    });
  }

  if (expression.type === AST_NODE_TYPES.AwaitExpression) {
    return isErrorLikeExpression(expression.argument);
  }

  if (expression.type === AST_NODE_TYPES.ChainExpression) {
    return isErrorLikeExpression(expression.expression);
  }

  if (
    expression.type === AST_NODE_TYPES.TSAsExpression ||
    expression.type === AST_NODE_TYPES.TSNonNullExpression ||
    expression.type === AST_NODE_TYPES.TSSatisfiesExpression ||
    expression.type === AST_NODE_TYPES.TSTypeAssertion
  ) {
    return isErrorLikeExpression(expression.expression);
  }

  return false;
}

function isErrorLikeCallExpression(expression: TSESTree.CallExpression): boolean {
  if (expression.callee.type === AST_NODE_TYPES.Identifier) {
    return isErrorLikeName(expression.callee.name);
  }

  if (isPromiseRejectCall(expression)) {
    return true;
  }

  return (
    expression.callee.type === AST_NODE_TYPES.MemberExpression &&
    expression.callee.object.type === AST_NODE_TYPES.Identifier &&
    isErrorLikeName(expression.callee.object.name)
  );
}

function isPromiseRejectCall(expression: TSESTree.CallExpression): boolean {
  return (
    expression.callee.type === AST_NODE_TYPES.MemberExpression &&
    expression.callee.object.type === AST_NODE_TYPES.Identifier &&
    expression.callee.object.name === "Promise" &&
    getPropertyName(expression.callee) === "reject"
  );
}

function findDescendant(
  root: TSESTree.Node,
  visitorKeys: VisitorKeys,
  predicate: (node: TSESTree.Node) => boolean,
): TSESTree.Node | undefined {
  const stack = [root];

  while (stack.length > 0) {
    const current = stack.pop();
    if (!current) {
      continue;
    }

    if (predicate(current)) {
      return current;
    }

    if (current !== root && isNestedExecutableBoundary(current)) {
      continue;
    }

    const childNodes = getChildNodes(current, visitorKeys);
    for (let index = childNodes.length - 1; index >= 0; index -= 1) {
      const childNode = childNodes[index];
      if (childNode) {
        stack.push(childNode);
      }
    }
  }

  return undefined;
}

function getChildNodes(node: TSESTree.Node, visitorKeys: VisitorKeys): TSESTree.Node[] {
  const keys = visitorKeys[node.type] ?? [];
  const nodeFields = node as unknown as Record<string, unknown>;
  const childNodes: TSESTree.Node[] = [];

  for (const key of keys) {
    const value = nodeFields[key];
    if (isNode(value)) {
      childNodes.push(value);
      continue;
    }

    if (!Array.isArray(value)) {
      continue;
    }

    for (const item of value) {
      if (isNode(item)) {
        childNodes.push(item);
      }
    }
  }

  return childNodes;
}

function isNode(value: unknown): value is TSESTree.Node {
  return (
    typeof value === "object" && value !== null && "type" in value && typeof value.type === "string"
  );
}

function isNestedExecutableBoundary(node: TSESTree.Node): boolean {
  return NESTED_EXECUTABLE_BOUNDARY_NODE_TYPES.has(node.type);
}

function getCallTargetName(callExpression: TSESTree.CallExpression): string | undefined {
  return getExpressionName(callExpression.callee);
}

function getConstructedName(newExpression: TSESTree.NewExpression): string | undefined {
  return getExpressionName(newExpression.callee);
}

function getExpressionName(node: TSESTree.Node): string | undefined {
  if (node.type === AST_NODE_TYPES.Identifier) {
    return node.name;
  }

  if (node.type === AST_NODE_TYPES.MemberExpression) {
    return getPropertyName(node);
  }

  if (node.type === AST_NODE_TYPES.ChainExpression) {
    return getExpressionName(node.expression);
  }

  if (
    node.type === AST_NODE_TYPES.TSAsExpression ||
    node.type === AST_NODE_TYPES.TSNonNullExpression ||
    node.type === AST_NODE_TYPES.TSSatisfiesExpression ||
    node.type === AST_NODE_TYPES.TSTypeAssertion
  ) {
    return getExpressionName(node.expression);
  }

  return undefined;
}

function getPropertyName(node: TSESTree.MemberExpression | TSESTree.Property): string | undefined {
  const property = node.type === AST_NODE_TYPES.MemberExpression ? node.property : node.key;

  if (property.type === AST_NODE_TYPES.Identifier) {
    return property.name;
  }

  if (property.type === AST_NODE_TYPES.Literal && typeof property.value === "string") {
    return property.value;
  }

  return undefined;
}

function isGuardFunctionName(functionName: string): boolean {
  return GUARD_NAME_PREFIXES.some((prefix) => functionName.startsWith(prefix));
}

function isExplicitViolationHelperName(functionName: string): boolean {
  const lowerCaseFunctionName = functionName.toLowerCase();

  return (
    lowerCaseFunctionName.includes("violation") &&
    EXPLICIT_VIOLATION_HELPER_PREFIXES.some((prefix) => lowerCaseFunctionName.startsWith(prefix))
  );
}

function isErrorLikeName(name: string): boolean {
  const lowerCaseName = name.toLowerCase();

  return (
    lowerCaseName.includes("error") ||
    lowerCaseName === "err" ||
    lowerCaseName.endsWith("err") ||
    lowerCaseName.includes("failure") ||
    lowerCaseName.includes("violation")
  );
}
