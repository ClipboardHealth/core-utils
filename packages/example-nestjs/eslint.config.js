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
    rules: {
      // Enable type-aware rules (disabled in base config)
      "@typescript-eslint/return-await": ["error", "always"],
      "expect-type/expect": "error",
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
    rules: {
      // Enable type-aware rules (disabled in base config)
      "@typescript-eslint/return-await": ["error", "always"],
      "expect-type/expect": "error",
    },
    },
  },
];
