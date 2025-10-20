const nxPlugin = require("@nx/eslint-plugin");
const baseConfig = require("./dist/packages/eslint-config");
const globals = require("globals");
const jsoncParser = require("jsonc-eslint-parser");

module.exports = [
  // Global ignores
  {
    ignores: [
      "**/coverage/**",
      "**/dist/**",
      "**/node_modules/**",
      "**/eslint.config.js",
      // eslint-config package has its own config to avoid circular dependency
      "packages/eslint-config/**",
    ],
  },

  // Base config for TS/JS files
  ...baseConfig,

  // Root-level config with Nx plugin
  {
    files: ["**/*.{ts,tsx,js,jsx}"],
    plugins: {
      "@nx": nxPlugin,
    },
    rules: {
      "unicorn/filename-case": ["error", { case: "camelCase" }],
      "@nx/enforce-module-boundaries": [
        "error",
        {
          allow: [],
          allowCircularSelfDependency: true,
          banTransitiveDependencies: true,
          depConstraints: [
            {
              sourceTag: "*",
              onlyDependOnLibsWithTags: ["*"],
            },
          ],
          enforceBuildableLibDependency: true,
        },
      ],
    },
  },

  // Test files (add Jest globals)
  {
    files: ["**/*.spec.{ts,tsx,js,jsx}", "**/*.test.{ts,tsx,js,jsx}"],
    languageOptions: {
      globals: {
        ...globals.jest,
      },
    },
  },

  // Examples files
  {
    files: ["**/examples/**/*.ts"],
    rules: {
      "no-console": "off",
    },
  },

  // JSON files
  {
    files: ["**/*.json"],
    languageOptions: {
      parser: jsoncParser,
    },
    rules: {
      // Disable rules that don't work with JSON files
      "no-irregular-whitespace": "off",
    },
  },
];
