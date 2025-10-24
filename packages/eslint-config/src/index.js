const path = require("node:path");
const fs = require("node:fs");

/*
 * Since the rules in the eslint-plugin project are in Typescript and are a package in this
 * monorepo, it's not straightforward to include that plugin when using the ESLint config to lint
 * the code in this monorepo itself. Nx currently symlinks each package in
 * `node_modules/@clipboard-health` folder to the source folder rather than the output in `dist/`,
 * and this will give an error where it cannot find the file:
 * `core-utils/node_modules/@clipboard-health/eslint-plugin/src/index.js` when trying to lint code
 * for any package in this monorepo.
 *
 * As a workaround, we check if we're inside the core-utils monorepo and skip including the
 * eslint-plugin in the ESLint config. We'll need to fix this in the future if we need to rely on a
 * rule from the eslint-plugin to lint code within core-utils itself.
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

const plugins = [
  "expect-type",
  "jest",
  "no-only-tests",
  "simple-import-sort",
  "sonarjs",
  "@typescript-eslint",
];

// Only add `@clipboard-health/eslint-plugin` if we're outside the core-utils monorepo
if (isOutsideCoreUtilsMonorepo) {
  plugins.push("@clipboard-health");
}

module.exports = {
  extends: [
    "eslint:recommended",
    "plugin:@typescript-eslint/eslint-recommended",
    "plugin:@typescript-eslint/recommended",
    "airbnb-base",
    "plugin:eslint-comments/recommended",
    "plugin:expect-type/recommended",
    "plugin:jest/recommended",
    "plugin:jest/style",
    "plugin:import/recommended",
    "plugin:n/recommended",
    "plugin:no-use-extend-native/recommended",
    "plugin:security/recommended",
    "plugin:sonarjs/recommended",
    "plugin:unicorn/recommended",
    "xo",
    "xo-typescript/space",
    "prettier",
  ],
  overrides: [
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
        // Interferes with `jest`'s `expect.any`
        "@typescript-eslint/no-unsafe-assignment": "off",
      },
    },
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
  ],
  parser: "@typescript-eslint/parser",
  parserOptions: {
    projectService: true,
  },
  plugins,
  rules: {
    // Start: Deprecated rules removed in v8
    "@typescript-eslint/ban-types": "off",
    "@typescript-eslint/lines-between-class-members": "off",
    "@typescript-eslint/no-throw-literal": "off",
    "@typescript-eslint/padding-line-between-statements": "off",
    // End: Deprecated rules removed in v8

    // See https://github.com/microsoft/TypeScript/wiki/Performance#preferring-interfaces-over-intersections
    "@typescript-eslint/consistent-type-definitions": ["error", "interface"],

    // Too many false positives
    "@typescript-eslint/naming-convention": "off",

    // Makes functional programming difficult
    "@typescript-eslint/no-unsafe-call": "off",

    // Prefer an escape hatch instead of an outright ban
    "@typescript-eslint/no-unused-vars": [
      "warn",
      { argsIgnorePattern: "^_", varsIgnorePattern: "^_" },
    ],
    "@typescript-eslint/return-await": ["error", "always"],

    // Breaks code when temporarily commented, adding more friction than the value provided.
    "capitalized-comments": "off",

    // Recommends using static fields instead of moving to a function
    "class-methods-use-this": "off",

    // Prevent bugs
    curly: ["error", "all"],

    // Our libraries don't use ESM
    "import/extensions": "off",

    "import/no-cycle": ["error", { ignoreExternal: true, maxDepth: 16 }],

    // Rely on `"n/no-extraneous-import"` instead
    "import/no-extraneous-dependencies": "off",

    // Doesn't play well with NX/monorepos
    "import/no-unresolved": "off",

    // Prefer named exports
    "import/prefer-default-export": "off",
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

    // Set to warn so LLMs to write worse code to get around it
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
        // Adapted from Airbnb's config, but allows ForOfStatement.
        // See https://github.com/airbnb/javascript/blob/0f3ca32323b8d5770de3301036e65511c6d18e00/packages/eslint-config-airbnb-base/rules/style.js#L340-L358
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
};
