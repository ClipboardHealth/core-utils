import type { TSESTree } from "@typescript-eslint/utils";
import { AST_NODE_TYPES } from "@typescript-eslint/utils";
import { type RuleContext } from "@typescript-eslint/utils/dist/ts-eslint";

import createRule from "../../createRule";
import {
  isIdentifierExpression,
  isMemberExpression,
  isNonNullAssertion,
  isTypescriptTypedExpression,
} from "../tsEsTreeTypeGuards";

function reportViolationIfObjectAssignReturnValueUsed(
  context: Readonly<RuleContext<"objectAssignReturnValueUsed", unknown[]>>,
  expression: TSESTree.Expression,
): void {
  const unwrappedExpression = unwrapExpression(expression);
  if (isObjectAssignCall(unwrappedExpression)) {
    context.report({
      node: unwrappedExpression,
      messageId: "objectAssignReturnValueUsed",
    });
  }
}

// Returns true iff the expression is the invocation of `Object.assign`
function isObjectAssignCall(expression: TSESTree.Expression): boolean {
  // Verify that the passed in expression is a function call
  if (expression.type !== AST_NODE_TYPES.CallExpression) {
    return false;
  }

  // Verify that the expression is a member function on an object, e.g. x.call() or f().call()
  const { callee } = expression;
  if (!isMemberExpression(callee)) {
    return false;
  }

  // Verify that the function call is on an object identity, e.g. X.call() (but not f().call())
  const { object } = callee;
  if (!isIdentifierExpression(object)) {
    return false;
  }

  // Verify that the function call is on the identifier referring to Object, e.g. Object.call()
  if (object.name !== "Object") {
    return false;
  }

  // Verify that the function being called is "assign"
  const { property } = callee;
  return property.type === AST_NODE_TYPES.Identifier && property.name === "assign";
}

/*
 * Unwraps some wrapped expressions to get to the base expression. For example,
 * Unwraps "return x as Type" to "return x" and unwraps "(x)!" to "x"
 * This is necessary so that our rule can lint the underlying expression for violations
 *
 * If you want to reuse this in a wider use case, you may have to expand this to specifically deal
 * with parentheses and other cases.
 */
function unwrapExpression(expression: TSESTree.Expression): TSESTree.Expression {
  if (isTypescriptTypedExpression(expression) || isNonNullAssertion(expression)) {
    return unwrapExpression(expression.expression);
  }

  return expression;
}

const rule = createRule({
  name: "forbid-object-assign",
  defaultOptions: [],
  meta: {
    type: "problem",
    docs: {
      description: "Favor object spread operator {...obj} over Object.assign",
    },
    schema: [],
    messages: {
      objectAssignReturnValueUsed:
        "Use the object spread operator. Object.assign mutates the first argument which is confusing. See https://www.notion.so/BP-TypeScript-Style-Guide-5d4c24aea08a4b9f9feb03550f2c5310?source=copy_link#2568643321f4805ba04ecce1082b2b38 for more information.",
    },
  },

  create(context: Readonly<RuleContext<"objectAssignReturnValueUsed", unknown[]>>) {
    return {
      VariableDeclarator(node: TSESTree.VariableDeclarator) {
        if (node.init === null) {
          return;
        }

        reportViolationIfObjectAssignReturnValueUsed(context, node.init);
      },
      AssignmentExpression(node: TSESTree.AssignmentExpression) {
        const rightHandSideOfAssignment = node.right;
        reportViolationIfObjectAssignReturnValueUsed(context, rightHandSideOfAssignment);
      },
      ReturnStatement(node: TSESTree.ReturnStatement) {
        if (node.argument === null) {
          return;
        }

        reportViolationIfObjectAssignReturnValueUsed(context, node.argument);
      },
      MemberExpression(node: TSESTree.MemberExpression) {
        reportViolationIfObjectAssignReturnValueUsed(context, node.object);
      },
      TemplateLiteral(node: TSESTree.TemplateLiteral) {
        node.expressions.forEach((expression) => {
          reportViolationIfObjectAssignReturnValueUsed(context, expression);
        });
      },
      ArrayExpression(node: TSESTree.ArrayExpression) {
        node.elements.forEach((expression) => {
          if (expression === null) {
            return;
          }

          if (expression.type === AST_NODE_TYPES.SpreadElement) {
            reportViolationIfObjectAssignReturnValueUsed(context, expression.argument);
          } else {
            reportViolationIfObjectAssignReturnValueUsed(context, expression);
          }
        });
      },
      CallExpression(node: TSESTree.CallExpression) {
        node.arguments.forEach((argument) => {
          if (argument.type === AST_NODE_TYPES.SpreadElement) {
            reportViolationIfObjectAssignReturnValueUsed(context, argument.argument);
          } else {
            reportViolationIfObjectAssignReturnValueUsed(context, argument);
          }
        });
      },
    };
  },
});

export default rule;
