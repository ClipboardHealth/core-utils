const rootConfig = require("../../eslint.config.js");

module.exports = [
  ...rootConfig,

  // Package-specific overrides
  {
    files: ["**/*.{ts,tsx,js,jsx}"],
    ignores: ["**/*.json", "**/package.json"],
    languageOptions: {
      parserOptions: {
        project: "./tsconfig.lint.json",
        tsconfigRootDir: __dirname,
      },
    },
  },

  // End-to-end test files override
  {
    files: ["**/*.endToEnd.spec.ts"],
    rules: {
      "@typescript-eslint/no-unsafe-call": "off",
      "@typescript-eslint/no-unsafe-return": "off",
      "jest/expect-expect": "off",
    },
  },
];
