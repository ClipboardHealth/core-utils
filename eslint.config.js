const js = require("@eslint/js");
const typescriptEslint = require("@typescript-eslint/eslint-plugin");
const typescriptParser = require("@typescript-eslint/parser");
const globals = require("globals");

const unicornPlugin = require("eslint-plugin-unicorn");
const unicorn = unicornPlugin.default || unicornPlugin;
const sonarjs = require("eslint-plugin-sonarjs");

module.exports = [
  js.configs.recommended,
  {
    files: ["**/*.{js,jsx,ts,tsx}"],
    languageOptions: {
      parser: typescriptParser,
      parserOptions: {
        ecmaVersion: "latest",
        sourceType: "module",
      },
      globals: {
        ...globals.node,
        ...globals.es2022,
      },
    },
    plugins: {
      "@typescript-eslint": typescriptEslint,
      unicorn,
      sonarjs,
    },
    rules: {
      ...typescriptEslint.configs.recommended.rules,
      "@typescript-eslint/no-require-imports": "off",
      "no-undef": "off", // TypeScript handles this
      "@typescript-eslint/ban-types": "off",
      "@typescript-eslint/no-unused-vars": [
        "warn",
        {
          argsIgnorePattern: "^_",
          varsIgnorePattern: "^_",
          ignoreRestSiblings: true,
        },
      ],
      "unicorn/no-useless-undefined": "off",
      "unicorn/prefer-top-level-await": "off",
      "unicorn/no-thenable": "off",
      "unicorn/new-for-builtins": "off",
      "unicorn/no-empty-file": "off",
      "sonarjs/cognitive-complexity": "off",
      "no-redeclare": "off", // Allow function overloads
      "no-empty": "off", // Allow empty catch blocks
    },
  },
  {
    files: ["**/*.spec.{js,jsx,ts,tsx}", "**/*.test.{js,jsx,ts,tsx}"],
    languageOptions: {
      globals: {
        ...globals.jest,
      },
    },
  },
  {
    ignores: ["**/node_modules/**", "**/dist/**", "**/build/**", "**/*.d.ts", "**/.eslintignore"],
  },
];
