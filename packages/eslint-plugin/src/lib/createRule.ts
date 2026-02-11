import { ESLintUtils } from "@typescript-eslint/utils";

export const createRule = ESLintUtils.RuleCreator(
  (name) =>
    `https://github.com/ClipboardHealth/core-utils/tree/main/packages/eslint-plugin/src/lib/rules/${name}`,
);
