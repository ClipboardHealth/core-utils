// For the eslint-config package itself, we can't use the compiled dist version
// because it has issues with isOutsideCoreUtilitiesMonorepo being determined at build time.
// Instead, use a simplified config that directly imports from source when inside the monorepo.

const eslint = require("@eslint/js");
const tseslint = require("typescript-eslint");
const globals = require("globals");
const jsoncParser = require("jsonc-eslint-parser");

module.exports = [
  // Simplified base config
  eslint.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ["**/*.{ts,tsx,js,jsx}"],
    languageOptions: {
      parser: tseslint.parser,
      parserOptions: {
        project: "./tsconfig.lint.json",
        tsconfigRootDir: __dirname,
      },
      globals: {
        ...globals.node,
      },
    },
    rules: {
      // Allow require() in this package as it's needed for CommonJS exports
      "@typescript-eslint/no-require-imports": "off",
      // Allow any types for plugin loading
      "@typescript-eslint/no-explicit-any": "off",
    },
  },
  {
    files: ["*.json"],
    languageOptions: {
      parser: jsoncParser,
    },
  },
];
