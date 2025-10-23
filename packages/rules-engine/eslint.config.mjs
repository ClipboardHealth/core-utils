import baseConfig from "../../eslint.config.mjs";

export default [
  {
    ignores: ["**/dist"],
  },
  ...baseConfig,
  {
    languageOptions: {
      parserOptions: {
        project: "tsconfig.lint.json",
        tsconfigRootDir: "packages/rules-engine",
      },
    },
  },
  {
    ignores: ["**/*.json", "!**/package.json"],
  },
];
