/**
 * @fileoverview Rule to prefer array methods over for loops without control flow breaks
 */
import { AST_NODE_TYPES, type TSESTree } from "@typescript-eslint/utils";

import createRule from "../../createRule";
import { forAnyChildNode } from "../ruleUtilities";

const STYLE_GUIDE_URL =
  "https://www.notion.so/BP-TypeScript-Style-Guide-5d4c24aea08a4b9f9feb03550f2c5310?source=copy_link#fb5599a17c4a456a839f2bb5654c371e";

function isFunction(node: TSESTree.Node): boolean {
  return (
    node.type === AST_NODE_TYPES.ArrowFunctionExpression ||
    node.type === AST_NODE_TYPES.FunctionExpression ||
    node.type === AST_NODE_TYPES.FunctionDeclaration
  );
}

function isForLoop(node: TSESTree.Node): boolean {
  return (
    node.type === AST_NODE_TYPES.ForStatement ||
    node.type === AST_NODE_TYPES.ForOfStatement ||
    node.type === AST_NODE_TYPES.ForInStatement
  );
}

function isSwitchStatement(node: TSESTree.Node): boolean {
  return node.type === AST_NODE_TYPES.SwitchStatement;
}

type ControlFlowType =
  | AST_NODE_TYPES.BreakStatement
  | AST_NODE_TYPES.ContinueStatement
  | AST_NODE_TYPES.ReturnStatement;

const ALL_CONTROL_FLOW_TYPES: readonly ControlFlowType[] = [
  AST_NODE_TYPES.BreakStatement,
  AST_NODE_TYPES.ContinueStatement,
  AST_NODE_TYPES.ReturnStatement,
];

/**
 * Recursively checks if a node contains any of the specified control flow statements, making sure
 * to traverse the AST only once.
 *
 * As we traverse, boundary nodes narrow down which statements we're still looking for:
 * - Function boundaries: stop looking for all statements (break, continue, return)
 * - For loop boundaries: stop looking for break and continue
 * - Switch boundaries: stop looking for break only
 */
function containsNodesThatWouldStopOuterForLoop(
  node: TSESTree.Node,
  nodeTypesThatCauseOuterLoopToStopEarly: readonly ControlFlowType[],
): boolean {
  // Found one of the control flow statements we're looking for
  if (nodeTypesThatCauseOuterLoopToStopEarly.includes(node.type as ControlFlowType)) {
    return true;
  }

  if (isFunction(node)) {
    // Function: control flow statements inside a function definition don't affect the outer loop
    return false;
  }

  if (isForLoop(node)) {
    // For loop: break/continue statements don't affect the outer loop, but return still does
    return forAnyChildNode(node, hasOuterLevelReturnStatement);
  }

  if (isSwitchStatement(node)) {
    // Switch: break statements exit the switch, but not the for loop.
    const nodeTypesWithoutBreakStatement = nodeTypesThatCauseOuterLoopToStopEarly.filter(
      (nodeType) => nodeType !== AST_NODE_TYPES.BreakStatement,
    );
    return forAnyChildNode(node, (node: TSESTree.Node): boolean => containsNodesThatWouldStopOuterForLoop(node, nodeTypesWithoutBreakStatement));
  }

  // otherwise we scan for all control flow statements: break/continue/return.
  return forAnyChildNode(node, (child) =>
    containsNodesThatWouldStopOuterForLoop(child, nodeTypesThatCauseOuterLoopToStopEarly),
  );
}

function hasOuterLevelReturnStatement(node: TSESTree.Node): boolean {
  return containsNodesThatWouldStopOuterForLoop(node, [AST_NODE_TYPES.ReturnStatement]);
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

function hasABreakInControlThatWouldStopOuterForLoop(node: TSESTree.Node) {
  return containsNodesThatWouldStopOuterForLoop(node, ALL_CONTROL_FLOW_TYPES);
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
      awaitInLoop:
        "Favor array methods over for loops (when not breaking early); however, array method callbacks do not actually await like a for loop does. " +
        "Consider whether the promises can be executed in parallel, and use an array method to do so. If they can't be executed in parallel, use `forEachAsyncSequentially` from `@clipboard-health/util-ts`. " +
        `See ${STYLE_GUIDE_URL}`,
    },
  },

  create(context) {
    function reportIfForLoopNotAllowed(
      node: TSESTree.ForStatement | TSESTree.ForOfStatement,
    ): void {
      if (!node.body) {
        return;
      }

      /** It is permissible to use for loops if there is a control flow statement that causes the for loop to stop early
       *  e.g. early return.
       *
       *  Those control statements don't work the same way with array methods.
       *
       *  Throws work the same in array methods, so those don't count as valid exceptions.
       */

      if (hasABreakInControlThatWouldStopOuterForLoop(node.body)) {
        return;
      }

      // Check for await to determine which message to show
      const messageId = hasOuterLevelAwait(node.body) ? "awaitInLoop" : "preferArrayMethods";

      context.report({ node, messageId });
    }

    return {
      ForStatement: reportIfForLoopNotAllowed,
      ForOfStatement: reportIfForLoopNotAllowed,
    };
  },
});

export default rule;
