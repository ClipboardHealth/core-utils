import { ESLintUtils } from "@typescript-eslint/utils";

const createRule = ESLintUtils.RuleCreator(
  (name) =>
    `https://github.com/ClipboardHealth/core-utils/tree/main/packages/eslint-plugin/src/lib/rules/${name}`,
);

export default createRule;
