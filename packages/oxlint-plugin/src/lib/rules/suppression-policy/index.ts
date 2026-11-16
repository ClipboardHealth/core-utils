/**
 * @fileoverview Rule to require a specific reason on every lint suppression and forbid suppressing
 * rules that guard against unsafe code
 */
import { appendFileSync } from "node:fs";

import { defineRule } from "@oxlint/plugins";

import { isPlainObject } from "../../internal/json";
import {
  evaluateDirective,
  formatViolation,
  parseDirective,
  RECORD_SETTING,
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
    const recordPath = readRecordPath({ settings: context.settings });

    return {
      Program() {
        for (const comment of context.sourceCode.getAllComments()) {
          const directive = parseDirective({ comment: comment.value });
          if (directive === undefined) {
            continue;
          }

          const reportBlanket = recordPath !== undefined;
          for (const violation of evaluateDirective({ directive, reportBlanket })) {
            if (recordPath === undefined) {
              context.report({ loc: comment.loc, ...violation });
            } else {
              appendFileSync(
                recordPath,
                `${JSON.stringify({
                  endLine: comment.loc.end.line,
                  file: context.physicalFilename,
                  message: formatViolation({ violation }),
                  startLine: comment.loc.start.line,
                })}\n`,
              );
            }
          }
        }
      },
    };
  },
});

export default rule;

/**
 * `cbh-check-suppressions` sets this so violations go to a file. Inline directives can silence any
 * report, including one about the directive that silences it; they cannot silence a file write.
 */
function readRecordPath(params: { settings: unknown }): string | undefined {
  const { settings } = params;
  const setting = isPlainObject(settings) ? settings[RECORD_SETTING] : undefined;
  const recordPath = isPlainObject(setting) ? setting["recordPath"] : undefined;
  return typeof recordPath === "string" ? recordPath : undefined;
}
