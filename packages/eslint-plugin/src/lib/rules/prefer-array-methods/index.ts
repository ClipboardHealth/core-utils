/**
 * @fileoverview Rule to prefer array methods over for loops without control flow breaks
 */
import { AST_NODE_TYPES, type TSESTree } from "@typescript-eslint/utils";

import createRule from "../../createRule";
import { forAnyChildNode } from "../ruleUtilities";

const STYLE_GUIDE_URL =
  "https://www.notion.so/BP-TypeScript-Style-Guide-5d4c24aea08a4b9f9feb03550f2c5310?source=copy_link#fb5599a17c4a456a839f2bb5654c371e";

const isFunction = (node: TSESTree.Node): boolean =>
  node.type === AST_NODE_TYPES.ArrowFunctionExpression ||
  node.type === AST_NODE_TYPES.FunctionExpression ||
  node.type === AST_NODE_TYPES.FunctionDeclaration;

const isForLoop = (node: TSESTree.Node): boolean =>
  node.type === AST_NODE_TYPES.ForStatement ||
  node.type === AST_NODE_TYPES.ForOfStatement ||
  node.type === AST_NODE_TYPES.ForInStatement;

// break inside switch doesn't exit the for loop, only the switch
const isSwitchStatement = (node: TSESTree.Node): boolean =>
  node.type === AST_NODE_TYPES.SwitchStatement;

function isControlFlowStatement(node: TSESTree.Node): boolean {
  return (
    node.type === AST_NODE_TYPES.BreakStatement ||
    node.type === AST_NODE_TYPES.ContinueStatement ||
    node.type === AST_NODE_TYPES.ReturnStatement
  );
}

/**
 * Recursively checks if a node contains a control flow statement (break, continue, return)
 * at the outer level. Does not traverse into nested functions, switch statements, or for loops.
 */
function hasAnOuterLevelControlFlowStatement(node: TSESTree.Node): boolean {
  if (isControlFlowStatement(node)) {
    return true;
  }

  /**
   * Control flow breaks inside a nested loop, function, and switch statement don't actually break
   * control out of the outer loop, and therefore the outer loop can be rewritten with array
   * methods. So, we skip looking here.
   */
  if (isFunction(node) || isForLoop(node) || isSwitchStatement(node)) {
    return false;
  }

  return forAnyChildNode(node, hasAnOuterLevelControlFlowStatement);
}

/**
 * Recursively checks if a node contains an await expression at the outer level.
 * Does not traverse into nested functions (await inside nested async functions doesn't count).
 */
function hasOuterLevelAwait(node: TSESTree.Node): boolean {
  if (node.type === AST_NODE_TYPES.AwaitExpression) {
    return true;
  }

  // Stop at function boundaries - await inside nested async functions doesn't count
  if (isFunction(node)) {
    return false;
  }

  return forAnyChildNode(node, hasOuterLevelAwait);
}

const rule = createRule({
  name: "prefer-array-methods",
  defaultOptions: [],
  meta: {
    type: "suggestion",
    docs: {
      description:
        "Prefer array methods (.forEach, .map, etc.) over for loops without control flow breaks",
    },
    schema: [],
    messages: {
      preferArrayMethods: `Favor array methods over for loops (when not breaking early). See ${STYLE_GUIDE_URL}`,
      awaitInLoop: `Favor array methods over for loops (when not breaking early); however, array method callbacks do not actually await like a for loop does.
      Consider whether the promises can be executed in parallel, and use an array method to do so. If they can't be executed in parallel, use \`forEachAsyncSequentially\` from \`@clipboard-health/util-ts\`. See ${STYLE_GUIDE_URL}`,
    },
  },

  create(context) {
    const reportIfForLoopNotAllowed = (
      node: TSESTree.ForStatement | TSESTree.ForOfStatement,
    ): void => {
      if (!node.body) {
        return;
      }

      // It is permissible to use for loops if there is a control flow statement, e.g. early return
      if (hasAnOuterLevelControlFlowStatement(node.body)) {
        return;
      }

      // Check for await to determine which message to show
      const messageId = hasOuterLevelAwait(node.body) ? "awaitInLoop" : "preferArrayMethods";

      context.report({
        node,
        messageId,
      });
    };

    return {
      ForStatement: reportIfForLoopNotAllowed,
      ForOfStatement: reportIfForLoopNotAllowed,
    };
  },
});

export default rule;
