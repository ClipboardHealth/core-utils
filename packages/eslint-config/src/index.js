const path = require("node:path");
const fs = require("node:fs");

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

module.exports = async () => {
  const tseslint = await import("typescript-eslint");
  const eslintComments = await import("eslint-plugin-eslint-comments");
  const expectType = await import("eslint-plugin-expect-type");
  const jest = await import("eslint-plugin-jest");
  const importX = await import("eslint-plugin-import-x");
  const n = await import("eslint-plugin-n");
  const noUseExtendNative = await import("eslint-plugin-no-use-extend-native");
  const noOnlyTests = await import("eslint-plugin-no-only-tests");
  const security = await import("eslint-plugin-security");
  const simpleImportSort = await import("eslint-plugin-simple-import-sort");
  const sonarjs = await import("eslint-plugin-sonarjs");
  const unicorn = await import("eslint-plugin-unicorn");
  const prettier = await import("eslint-config-prettier");

  const clipboardHealthPlugin = isOutsideCoreUtilsMonorepo
    ? await import("@clipboard-health/eslint-plugin")
    : null;

  const config = [
    // Base recommended configs
    ...tseslint.config(
      ...tseslint.configs.strictTypeChecked,
      ...tseslint.configs.stylisticTypeChecked
    ),
    {
      plugins: {
        "eslint-comments": eslintComments.default,
        "expect-type": expectType.default,
        jest: jest.default,
        "import-x": importX.default,
        n: n.default,
        "no-use-extend-native": noUseExtendNative.default,
        "no-only-tests": noOnlyTests.default,
        security: security.default,
        "simple-import-sort": simpleImportSort.default,
        sonarjs: sonarjs.default,
        unicorn: unicorn.default,
        ...(clipboardHealthPlugin && {
          "@clipboard-health": clipboardHealthPlugin.default,
        }),
      },
    },
    {
      rules: {
        ...eslintComments.default.configs.recommended.rules,
        ...expectType.default.configs.recommended.rules,
        ...jest.default.configs.recommended.rules,
        ...jest.default.configs.style.rules,
        ...importX.default.configs.recommended.rules,
        ...n.default.configs.recommended.rules,
        ...security.default.configs.recommended.rules,
        ...sonarjs.default.configs.recommended.rules,
        ...unicorn.default.configs.recommended.rules,
      },
    },
    // Custom rules
    {
      rules: {
        // See https://github.com/microsoft/TypeScript/wiki/Performance#preferring-interfaces-over-intersections
        "@typescript-eslint/consistent-type-definitions": ["error", "interface"],

        // Too many false positives
        "@typescript-eslint/naming-convention": "off",

        // Makes functional programming difficult
        "@typescript-eslint/no-unsafe-call": "off",

        // Prefer an escape hatch instead of an outright ban
        "@typescript-eslint/no-unused-vars": [
          "warn",
          { argsIgnorePattern: "^_" },
        ],
        "@typescript-eslint/return-await": ["error", "always"],

        // Breaks code when temporarily commented, adding more friction than the value provided.
        "capitalized-comments": "off",

        // Recommends using static fields instead of moving to a function
        "class-methods-use-this": "off",

        // Prevent bugs
        curly: ["error", "all"],

        // Our libraries don't use ESM
        "import-x/extensions": "off",

        "import-x/no-cycle": ["error", { ignoreExternal: true, maxDepth: 16 }],

        // Rely on `"n/no-extraneous-import"` instead
        "import-x/no-extraneous-dependencies": "off",

        // Doesn't play well with NX/monorepos
        "import-x/no-unresolved": "off",

        // Prefer named exports
        "import-x/prefer-default-export": "off",

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

        // Our libraries don't use ESM
        "n/no-missing-import": "off",

        // Our libraries don't use ESM
        "n/no-unpublished-import": "off",

        // Allow PascalCase for Decorators
        "new-cap": ["warn", { capIsNew: false, newIsCap: true }],

        // Set to warn so LLMs don't write worse code to get around it
        "no-await-in-loop": "warn",

        // Disallow `.only` in tests to prevent it from making it into `main`.
        "no-only-tests/no-only-tests": "error",

        "no-restricted-imports": [
          "error",
          {
            paths: [
              // We want `ObjectId` to be imported from `mongoose` only
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

        // While continue can be misused, especially with nested loops and labels,
        // it can be useful for preventing code nesting and the existence of the rule
        // caused us to lose time debating its validity
        "no-continue": "off",

        // Prefer debugging ease over an extra microtask by requiring `return await`.
        // `no-return-await` states "This can make debugging more difficult."
        "no-return-await": "off",

        // False positive on `enum`s
        "no-shadow": "off",

        // Polarizing naming convention that isn't followed by us
        "no-underscore-dangle": "off",

        // We use TypeScript where these are caught by the compiler
        "no-use-before-define": ["error", { classes: false, functions: false }],

        /*
         * Only enable for properties. Favor arrow functions, they don't have a `this` reference,
         * preventing accidental usage.
         */
        "object-shorthand": ["error", "properties"],

        "security/detect-object-injection": "off",

        "simple-import-sort/exports": "warn",

        // Sort imports and exports
        "simple-import-sort/imports": "warn",

        // Makes functional programming difficult
        "unicorn/no-array-callback-reference": "off",

        // "Better readability" is subjective
        "unicorn/no-array-for-each": "off",

        // "Better readability" is subjective
        "unicorn/no-array-reduce": "off",

        // React, MongoDB, and Prisma use `null`
        "unicorn/no-null": "off",

        // Our libraries don't use ESM
        "unicorn/prefer-module": "off",

        // Allow common, well understood abbreviations
        "unicorn/prevent-abbreviations": [
          "error",
          { ignore: [/config/i, /params/i, /props/i, /ref/i] },
        ],

        // There are cases where duplicating strings is ok (tests, contracts, etc...)
        "sonarjs/no-duplicate-string": "off",
      },
      settings: { node: { version: ">=18.15.0" } },
    },
    // Override for test files
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
        // Interferes with `jest`'s `expect.any`
        "@typescript-eslint/no-unsafe-assignment": "off",
      },
    },
    // Override for DTO and repository files
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
    // Prettier must be last to override conflicting rules
    prettier,
  ];

  // Add clipboard-health plugin rules if outside monorepo
  if (clipboardHealthPlugin) {
    config.push(
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
      }
    );
  }

  return config;
};
