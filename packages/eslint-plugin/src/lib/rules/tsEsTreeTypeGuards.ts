import type { TSESTree } from "@typescript-eslint/utils";
import { AST_NODE_TYPES } from "@typescript-eslint/utils";

export function isMemberExpression(
  expression: TSESTree.Expression | TSESTree.Super,
): expression is TSESTree.MemberExpression {
  return expression.type === AST_NODE_TYPES.MemberExpression;
}

export function isIdentifierExpression(
  expression: TSESTree.Expression,
): expression is TSESTree.Identifier {
  return expression.type === AST_NODE_TYPES.Identifier;
}

export function isTypescriptTypedExpression(
  expression: TSESTree.Expression,
): expression is TSESTree.TSAsExpression | TSESTree.TSTypeAssertion {
  return (
    expression.type === AST_NODE_TYPES.TSAsExpression ||
    expression.type === AST_NODE_TYPES.TSTypeAssertion
  );
}

export function isNonNullAssertion(
  expression: TSESTree.Expression,
): expression is TSESTree.TSNonNullExpression {
  return expression.type === AST_NODE_TYPES.TSNonNullExpression;
}
