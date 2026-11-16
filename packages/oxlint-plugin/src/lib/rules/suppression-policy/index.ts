/**
 * @fileoverview Rule to require a specific reason on every lint suppression and forbid suppressing
 * rules that guard against unsafe code
 */
import { defineRule } from "@oxlint/plugins";

import {
  evaluateDirective,
  parseDirective,
  VIOLATION_MESSAGES,
} from "../../internal/suppressionPolicy";

const rule = defineRule({
  meta: {
    type: "problem",
    docs: {
      description:
        "Require ' -- <reason>' on every lint suppression, reject generic reasons, and forbid suppressing rules that guard against unsafe code",
      url: "https://github.com/ClipboardHealth/core-utils/tree/main/packages/oxlint-plugin/src/lib/rules/suppression-policy",
    },
    schema: [],
    messages: VIOLATION_MESSAGES,
  },
  create(context) {
    return {
      Program() {
        for (const comment of context.sourceCode.getAllComments()) {
          const directive = parseDirective({ comment: comment.value });
          if (directive === undefined) {
            continue;
          }

          for (const violation of evaluateDirective({ directive })) {
            context.report({ loc: comment.loc, ...violation });
          }
        }
      },
    };
  },
});

export default rule;
