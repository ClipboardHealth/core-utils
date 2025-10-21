// @ts-nocheck
const path = require("node:path");
const fs = require("node:fs");
const js = require("@eslint/js");
const globals = require("globals");
const tsPlugin = require("@typescript-eslint/eslint-plugin");
const tsParser = require("@typescript-eslint/parser");
const eslintComments = require("eslint-plugin-eslint-comments");
const expectType = require("eslint-plugin-expect-type");
const jest = require("eslint-plugin-jest");
const importPlugin = require("eslint-plugin-import");
const n = require("eslint-plugin-n");
const noUseExtendNative = require("eslint-plugin-no-use-extend-native");
const security = require("eslint-plugin-security");
const sonarjs = require("eslint-plugin-sonarjs");
const unicorn = require("eslint-plugin-unicorn");
const simpleImportSort = require("eslint-plugin-simple-import-sort");
const noOnlyTests = require("eslint-plugin-no-only-tests");
const prettier = require("eslint-config-prettier");

/*
 * Since the rules in the eslint-plugin project are in Typescript and are a package
 * in this monorepo, it's not straightforward to include that plugin when using the
 * ESLint config to lint the code in this monorepo itself. Nx currently symlinks each
 * package in `node_modules/@clipboard-health` folder to the source folder rather than
 * the output in `dist/`, and this will give an error where it cannot find the file:
 * `core-utils/node_modules/@clipboard-health/eslint-plugin/src/index.js` when trying
 * to lint code for any package in this monorepo.
 * As a workaround, we check if we're inside the core-utils monorepo and skip including
 * the eslint-plugin in the ESLint config. We'll need to fix this in the future if we
 * need to rely on a rule from the eslint-plugin to lint code within core-utils itself.
 */
const isOutsideCoreUtilsMonorepo = (() => {
  try {
    const packageJsonPath = path.resolve(process.cwd(), "package.json");
    const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, "utf8"));
    return packageJson.name !== "@clipboard-health/core-utils";
  } catch {
    return true;
  }
})();

let clipboardHealthPlugin;
if (isOutsideCoreUtilsMonorepo) {
  try {
    clipboardHealthPlugin = require("@clipboard-health/eslint-plugin");
  } catch {
    // Plugin not available
  }
}

module.exports = [
  js.configs.recommended,
  {
    plugins: {
      "@typescript-eslint": tsPlugin,
      "eslint-comments": eslintComments,
      "expect-type": expectType,
      jest,
      import: importPlugin,
      n,
      "no-use-extend-native": noUseExtendNative,
      security,
      sonarjs,
      unicorn,
      "simple-import-sort": simpleImportSort,
      "no-only-tests": noOnlyTests,
      ...(clipboardHealthPlugin ? { "@clipboard-health": clipboardHealthPlugin } : {}),
    },

    languageOptions: {
      parser: tsParser,
      parserOptions: {
        projectService: true,
      },
      globals: {
        ...globals.node,
        ...globals.es2021,
      },
    },

    rules: {
      // TypeScript ESLint rules
      "@typescript-eslint/consistent-type-definitions": ["error", "interface"],
      "@typescript-eslint/naming-convention": "off",
      "@typescript-eslint/no-unsafe-call": "off",
      "@typescript-eslint/no-unused-vars": ["warn", { argsIgnorePattern: "^_" }],
      "@typescript-eslint/return-await": ["error", "always"],

      // General ESLint rules
      "capitalized-comments": "off",
      "class-methods-use-this": "off",
      curly: ["error", "all"],

      // Import rules
      "import/extensions": "off",
      "import/no-cycle": ["error", { ignoreExternal: true, maxDepth: 16 }],
      "import/no-extraneous-dependencies": "off",
      "import/no-unresolved": "off",
      "import/prefer-default-export": "off",

      // Jest rules
      "jest/expect-expect": [
        "error",
        {
          assertFunctionNames: [
            "expect",
            "expectToBeDefined",
            "expectToBeLeft",
            "expectToBeNone",
            "expectToBeRight",
            "expectToBeSafeParseError",
            "expectToBeSafeParseSuccess",
            "expectToBeSome",
            "expectTypeOf",
          ],
        },
      ],

      // Node rules
      "n/no-missing-import": "off",
      "n/no-unpublished-import": "off",

      // General rules
      "new-cap": ["warn", { capIsNew: false, newIsCap: true }],
      "no-await-in-loop": "warn",
      "no-only-tests/no-only-tests": "error",

      "no-restricted-imports": [
        "error",
        {
          paths: [
            {
              importNames: ["ObjectId", "ObjectID"],
              message:
                'Importing `ObjectId` from `mongodb` is not allowed. Use `import { Types } from "mongoose"` and then `Types.ObjectId` instead.',
              name: "mongodb",
            },
            {
              name: "date-fns-tz",
              message:
                "date-fns-tz is not allowed. Use @clipboard-health/date-time instead. If it doesn't have what you need then please add it there and open a PR.",
            },
          ],
        },
      ],

      "no-restricted-syntax": [
        "error",
        {
          message:
            "for..in loops iterate over the entire prototype chain, which is virtually never what you want. Use Object.{keys,values,entries}, and iterate over the resulting array.",
          selector: "ForInStatement",
        },
        {
          message:
            "Labels are a form of GOTO; using them makes code confusing and hard to maintain and understand.",
          selector: "LabeledStatement",
        },
        {
          message:
            "`with` is disallowed in strict mode because it makes code difficult to predict and optimize.",
          selector: "WithStatement",
        },
        {
          selector: "TSEnumDeclaration",
          message:
            "Enums are one of the few non-type-level extensions to JavaScript, have pitfalls, and require explicit mapping. Use const objects instead.",
        },
      ],

      "no-continue": "off",
      "no-return-await": "off",
      "no-shadow": "off",
      "no-underscore-dangle": "off",
      "no-use-before-define": ["error", { classes: false, functions: false }],

      "object-shorthand": ["error", "properties"],
      "security/detect-object-injection": "off",

      "simple-import-sort/exports": "warn",
      "simple-import-sort/imports": "warn",

      // Unicorn rules
      "unicorn/no-array-callback-reference": "off",
      "unicorn/no-array-for-each": "off",
      "unicorn/no-array-reduce": "off",
      "unicorn/no-null": "off",
      "unicorn/prefer-module": "off",
      "unicorn/prevent-abbreviations": [
        "error",
        { ignore: [/config/i, /params/i, /props/i, /ref/i] },
      ],

      // SonarJS rules
      "sonarjs/no-duplicate-string": "off",
    },

    settings: {
      node: { version: ">=18.15.0" },
    },
  },

  // Test file overrides
  {
    files: [
      "*.spec.ts",
      "*.spec.tsx",
      "*.spec.js",
      "*.spec.jsx",
      "*.test.ts",
      "*.test.tsx",
      "*.test.js",
      "*.test.jsx",
    ],
    rules: {
      "@typescript-eslint/no-unsafe-assignment": "off",
    },
  },

  // DTO and Repository file overrides
  {
    files: ["**/*.dto.ts", "**/*.repository.ts", "**/*.repo.ts"],
    rules: {
      "@typescript-eslint/ban-types": [
        "error",
        {
          extendDefaults: true,
          types: {
            null: false,
          },
        },
      ],
    },
  },

  // Clipboard Health plugin rules (outside monorepo only)
  ...(isOutsideCoreUtilsMonorepo && clipboardHealthPlugin
    ? [
        {
          files: ["**/*.controller.ts", "**/*.controllers.ts"],
          rules: {
            "@clipboard-health/enforce-ts-rest-in-controllers": "error",
          },
        },
        {
          files: ["**/*.module.ts"],
          rules: {
            "@clipboard-health/require-http-module-factory": "error",
          },
        },
        {
          files: ["**/*.ts", "**/*.tsx"],
          rules: {
            "@clipboard-health/forbid-object-assign": "error",
          },
        },
      ]
    : []),

  // Prettier should be last to override other formatting rules
  prettier,
];
