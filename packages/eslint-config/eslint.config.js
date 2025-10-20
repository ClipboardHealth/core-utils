const rootConfig = require("../../eslint.config.js");
const jsoncParser = require("jsonc-eslint-parser");

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

  // JSON files override
  {
    files: ["*.json"],
    languageOptions: {
      parser: jsoncParser,
    },
    rules: {
      "@nx/dependency-checks": "off",
    },
  },
];
