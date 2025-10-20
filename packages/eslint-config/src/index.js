const path = require("node:path");
const fs = require("node:fs");
const eslint = require("@eslint/js");
const tseslint = require("typescript-eslint");
const globals = require("globals");

// Helper to get default export from ES modules
const getDefault = (module) => module.default || module;

const eslintCommentsModule = require("eslint-plugin-eslint-comments");
const eslintComments = getDefault(eslintCommentsModule);
const expectTypeModule = require("eslint-plugin-expect-type");
const expectType = getDefault(expectTypeModule);
const jestModule = require("eslint-plugin-jest");
const jest = getDefault(jestModule);
const importPluginModule = require("eslint-plugin-import");
const importPlugin = getDefault(importPluginModule);
const nModule = require("eslint-plugin-n");
const n = getDefault(nModule);
const noOnlyTestsModule = require("eslint-plugin-no-only-tests");
const noOnlyTests = getDefault(noOnlyTestsModule);
const noUseExtendNativeModule = require("eslint-plugin-no-use-extend-native");
const noUseExtendNative = getDefault(noUseExtendNativeModule);
const securityModule = require("eslint-plugin-security");
const security = getDefault(securityModule);
const simpleImportSortModule = require("eslint-plugin-simple-import-sort");
const simpleImportSort = getDefault(simpleImportSortModule);
const sonarjsModule = require("eslint-plugin-sonarjs");
const sonarjs = getDefault(sonarjsModule);
const unicornModule = require("eslint-plugin-unicorn");
const unicorn = getDefault(unicornModule);
const xoConfigModule = require("eslint-config-xo");
const xoConfig = getDefault(xoConfigModule);
const prettierConfigModule = require("eslint-config-prettier");
const prettierConfig = getDefault(prettierConfigModule);

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

// Conditionally load clipboard-health plugin
let clipboardHealth;
const plugins = {
  "@typescript-eslint": tseslint.plugin,
  "eslint-comments": eslintComments,
  "expect-type": expectType,
  jest,
  import: importPlugin,
  n,
  "no-only-tests": noOnlyTests,
  "no-use-extend-native": noUseExtendNative,
  security,
  "simple-import-sort": simpleImportSort,
  sonarjs,
  unicorn,
};

if (isOutsideCoreUtilsMonorepo) {
  clipboardHealth = require("@clipboard-health/eslint-plugin");
  plugins["@clipboard-health"] = clipboardHealth;
}

module.exports = [
  // Base ESLint recommended config
  eslint.configs.recommended,

  // TypeScript ESLint recommended configs
  ...tseslint.configs.recommended,

  // XO config (filter out JSONC config as we handle it ourselves)
  ...xoConfig.filter((c) => !c.files || !c.files.includes("**/*.jsonc")),

  // Main configuration
  {
    files: ["**/*.{js,mjs,cjs,jsx,ts,tsx}"],
    plugins,
    languageOptions: {
      parser: tseslint.parser,
      parserOptions: {
        project: ["tsconfig.json"],
        tsconfigRootDir: __dirname,
      },
      globals: {
        ...globals.node,
      },
    },
    settings: {
      node: { version: ">=18.15.0" },
    },
    rules: {
      // Import plugin recommended rules
      "import/no-unresolved": "error",
      "import/named": "error",
      "import/default": "error",
      "import/namespace": "error",
      "import/no-absolute-path": "error",
      "import/no-dynamic-require": "error",
      "import/no-webpack-loader-syntax": "error",
      "import/no-self-import": "error",
      "import/no-useless-path-segments": "error",
      "import/export": "error",
      "import/no-named-as-default": "warn",
      "import/no-named-as-default-member": "warn",
      "import/no-deprecated": "warn",
      "import/no-mutable-exports": "warn",
      "import/no-amd": "error",
      "import/first": "error",
      "import/no-duplicates": "error",
      "import/extensions": "off",
      "import/newline-after-import": "warn",
      "import/no-unassigned-import": "off",
      "import/no-named-default": "error",
      "import/no-anonymous-default-export": "warn",
      "import/no-cycle": ["error", { ignoreExternal: true, maxDepth: 16 }],
      "import/no-extraneous-dependencies": "off",
      "import/no-unresolved": "off",
      "import/prefer-default-export": "off",

      // N plugin recommended rules
      "n/no-deprecated-api": "error",
      "n/no-exports-assign": "error",
      "n/no-missing-require": "error",
      "n/no-unpublished-bin": "error",
      "n/no-unsupported-features/es-builtins": "error",
      "n/no-unsupported-features/node-builtins": "error",
      "n/process-exit-as-throw": "error",
      "n/hashbang": "error",
      "n/no-missing-import": "off",
      "n/no-unpublished-import": "off",

      // Security plugin rules
      ...security.configs.recommended.rules,
      "security/detect-object-injection": "off",

      // SonarJS rules
      ...sonarjs.configs.recommended.rules,
      "sonarjs/no-duplicate-string": "off",

      // Unicorn rules (using flat/recommended for ESLint 9)
      ...(unicorn.configs['flat/recommended'] || unicorn.configs.recommended).rules,
      "unicorn/no-array-callback-reference": "off",
      "unicorn/no-array-for-each": "off",
      "unicorn/no-array-reduce": "off",
      "unicorn/no-null": "off",
      "unicorn/prefer-module": "off",
      "unicorn/prevent-abbreviations": [
        "error",
        { ignore: [/config/i, /params/i, /props/i, /ref/i] },
      ],

      // ESLint Comments rules
      ...eslintComments.configs.recommended.rules,

      // Jest rules (using flat/* for ESLint 9)
      ...(jest.configs['flat/recommended'] || jest.configs.recommended).rules,
      ...(jest.configs['flat/style'] || jest.configs.style).rules,
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

      // Expect Type rules
      ...expectType.configs.recommended.rules,

      // TypeScript ESLint rules
      "@typescript-eslint/consistent-type-definitions": ["error", "interface"],
      "@typescript-eslint/naming-convention": "off",
      "@typescript-eslint/no-unsafe-call": "off",
      "@typescript-eslint/no-unused-vars": ["warn", { argsIgnorePattern: "^_" }],
      "@typescript-eslint/return-await": ["error", "always"],

      // General rules
      "capitalized-comments": "off",
      "class-methods-use-this": "off",
      curly: ["error", "all"],
      "new-cap": ["warn", { capIsNew: false, newIsCap: true }],
      "no-await-in-loop": "warn",
      "no-continue": "off",
      "no-only-tests/no-only-tests": "error",
      "no-return-await": "off",
      "no-shadow": "off",
      "no-underscore-dangle": "off",
      "no-use-before-define": ["error", { classes: false, functions: false }],
      "object-shorthand": ["error", "properties"],

      // Simple import sort
      "simple-import-sort/exports": "warn",
      "simple-import-sort/imports": "warn",

      // No restricted imports
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

      // No restricted syntax
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

      ...(isOutsideCoreUtilsMonorepo
        ? {
            "@clipboard-health/enforce-ts-rest-in-controllers": "off",
            "@clipboard-health/require-http-module-factory": "off",
            "@clipboard-health/forbid-object-assign": "off",
          }
        : {}),
    },
  },

  // Test files override
  {
    files: [
      "**/*.spec.ts",
      "**/*.spec.tsx",
      "**/*.spec.js",
      "**/*.spec.jsx",
      "**/*.test.ts",
      "**/*.test.tsx",
      "**/*.test.js",
      "**/*.test.jsx",
    ],
    rules: {
      "@typescript-eslint/no-unsafe-assignment": "off",
    },
  },

  // DTO and Repository files override
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

  // Controller files override (only outside core-utils)
  ...(isOutsideCoreUtilsMonorepo
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

  // Prettier config (must be last to override other formatting rules)
  prettierConfig,
];
