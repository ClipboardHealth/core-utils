import nxEslintPlugin from "@nx/eslint-plugin";
import sharedConfig from "./packages/eslint-config/src/index.js";

const baseConfig = await sharedConfig();

export default [
  {
    ignores: ["**/dist"],
  },
  ...baseConfig,
  { plugins: { "@nx": nxEslintPlugin } },
  {
    rules: {
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
  {
    files: ["**/*.ts", "**/*.tsx", "**/*.js", "**/*.jsx"],
    rules: {
      "unicorn/filename-case": ["error", { case: "camelCase" }],
    },
  },
  {
    files: ["**/*.spec.ts", "**/*.spec.tsx", "**/*.spec.js", "**/*.spec.jsx"],
    languageOptions: {
      globals: {
        jest: true,
      },
    },
  },
  {
    files: ["./examples/**/*.ts"],
    rules: {
      "no-console": "off",
    },
  },
  {
    files: ["package.json"],
    rules: {
      "@nx/dependency-checks": "error",
    },
    languageOptions: {
      parser: (await import("jsonc-eslint-parser")).default,
    },
  },
  {
    ignores: [
      "# Alphabetical directories",
      "coverage/",
      "dist/",
      "node_modules/",
      "# Alphabetical files",
      "packages/eslint-config/src/index.js",
    ],
  },
];
