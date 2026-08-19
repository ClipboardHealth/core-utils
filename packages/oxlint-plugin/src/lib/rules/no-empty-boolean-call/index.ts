/**
 * @fileoverview Rule to disallow calling Boolean without an argument
 * @see https://github.com/ClipboardHealth/clipboard-health/blob/a27b273938694a31897274b2baa0899783b6299f/scripts/oxlint-plugin/rules/no-restricted-syntax.mjs
 */
import { defineRule } from "@oxlint/plugins";

const rule = defineRule({
  meta: {
    type: "problem",
    docs: {
      description: "Disallow calling Boolean without an argument",
      url: "https://github.com/ClipboardHealth/core-utils/tree/main/packages/oxlint-plugin/src/lib/rules/no-empty-boolean-call",
    },
    schema: [],
    messages: {
      emptyBooleanCall: "Avoid using Boolean() without arguments.",
    },
  },
  create(context) {
    return {
      CallExpression(node) {
        if (
          node.callee.type === "Identifier" &&
          node.callee.name === "Boolean" &&
          node.arguments.length === 0
        ) {
          context.report({ node, messageId: "emptyBooleanCall" });
        }
      },
    };
  },
});

export default rule;
