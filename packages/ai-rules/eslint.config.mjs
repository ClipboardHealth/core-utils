import baseConfig from "../../eslint.config.mjs";

export default [
  {
    ignores: ["**/dist"],
  },
  ...baseConfig,
  {
    settings: {
      react: {
        version: "detect",
      },
    },
    languageOptions: {
      parserOptions: {
        project: "tsconfig.lint.json",
        tsconfigRootDir: "packages/ai-rules",
      },
    },
  },
  {
    files: ["**/*.ts"],
    rules: {
      "no-console": "off",
      "security/detect-non-literal-fs-filename": "off",
    },
  },
  {
    ignores: ["**/*.json", "!**/package.json"],
  },
];
