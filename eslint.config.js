const nxPlugin = require("@nx/eslint-plugin");
const baseConfig = require("./packages/eslint-config/src/index.js");
const globals = require("globals");
const jsoncParser = require("jsonc-eslint-parser");

module.exports = [
  // Global ignores
  {
    ignores: [
      "**/coverage/**",
      "**/dist/**",
      "**/node_modules/**",
      "packages/eslint-config/src/index.js",
      "packages/eslint-config/src/index.d.ts",
      "packages/eslint-config/src/react.js",
      "eslint.config.js",
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
    files: [
      "**/*.spec.{ts,tsx,js,jsx}",
      "**/*.test.{ts,tsx,js,jsx}",
    ],
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

  // package.json files
  {
    files: ["**/package.json"],
    languageOptions: {
      parser: jsoncParser,
    },
    plugins: {
      "@nx": nxPlugin,
    },
    rules: {
      "@nx/dependency-checks": "error",
    },
  },
];
