import { FlatCompat } from "@eslint/eslintrc";
import { dirname } from "path";
import { fileURLToPath } from "url";
import js from "@eslint/js";
import nxEslintPlugin from "@nx/eslint-plugin";

const compat = new FlatCompat({
  baseDirectory: dirname(fileURLToPath(import.meta.url)),
  recommendedConfig: js.configs.recommended,
});

export default [
  {
    ignores: ["**/dist"],
  },
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
  ...compat
    .config({
      extends: ["./packages/eslint-config/src/index.js"],
    })
    .map((config) => ({
      ...config,
      files: ["**/*.ts", "**/*.tsx", "**/*.js", "**/*.jsx"],
      rules: {
        ...config.rules,
        "unicorn/filename-case": [
          "error",
          {
            case: "camelCase",
          },
        ],
      },
    })),
  ...compat
    .config({
      env: {
        jest: true,
      },
    })
    .map((config) => ({
      ...config,
      files: ["**/*.spec.ts", "**/*.spec.tsx", "**/*.spec.js", "**/*.spec.jsx"],
      rules: {
        ...config.rules,
      },
    })),
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
      parser: await import("jsonc-eslint-parser"),
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
