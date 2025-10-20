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
    rules: {
      // Enable type-aware rules (disabled in base config)
      "@typescript-eslint/return-await": ["error", "always"],
      "expect-type/expect": "error",
    },
  },
];
