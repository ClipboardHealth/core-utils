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
        tsconfigRootDir: "packages/example-nestjs",
      },
    },
  },
  {
    files: ["**/*.endToEnd.spec.ts"],
    rules: {
      "@typescript-eslint/no-unsafe-call": "off",
      "@typescript-eslint/no-unsafe-return": "off",
      "jest/expect-expect": "off",
    },
  },
  {
    ignores: ["**/*.json", "!**/package.json"],
  },
];
