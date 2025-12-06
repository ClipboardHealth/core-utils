/**
 * @fileoverview Rule to warn against using `?? 0` or `|| 0` without considering business implications
 */
import { AST_NODE_TYPES, type TSESTree } from "@typescript-eslint/utils";

import createRule from "../../createRule";

const isZeroLiteral = (node: TSESTree.Node): boolean =>
  node.type === AST_NODE_TYPES.Literal && node.value === 0;

const rule = createRule({
  name: "no-nullish-coalescing-zero",
  defaultOptions: [],
  meta: {
    type: "suggestion",
    docs: {
      description:
        "Warn against using `?? 0` or `|| 0` without considering whether zero is the correct business default",
    },
    schema: [],
    messages: {
      nullishCoalescingZero:
        "Using `?? 0` may hide undefined/null values that should be handled explicitly. Consider whether zero is the correct business default, or if the undefined case should be treated as an error.",
      logicalOrZero:
        "Using `|| 0` may hide falsy values (including 0, '', false) that should be handled explicitly. Consider whether zero is the correct business default, or if falsy values should be treated as an error.",
      logicalAndZero:
        "Using `&& 0` will always result in either a falsy value or 0. Consider whether this logic is intentional or if it should be handled differently.",
    },
  },

  create(context) {
    return {
      LogicalExpression(node) {
        if (!isZeroLiteral(node.right)) {
          return;
        }

        switch (node.operator) {
          case "??": {
            context.report({ node, messageId: "nullishCoalescingZero" });
            break;
          }

          case "||": {
            context.report({ node, messageId: "logicalOrZero" });
            break;
          }

          case "&&": {
            context.report({ node, messageId: "logicalAndZero" });
            break;
          }

          default: {
            break;
          }
        }
      },
    };
  },
});

export default rule;
