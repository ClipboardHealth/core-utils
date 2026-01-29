const path = require("node:path");
const fs = require("node:fs");

const baseNoRestrictedSyntax = [
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
];

const triggerIdempotencyKeyMessage =
  "Do not assert to TriggerIdempotencyKey; use `NotificationJobEnqueuer.enqueueOneOrMore` instead. See https://github.com/ClipboardHealth/core-utils/blob/main/packages/notifications/README.md.";

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
  "check-file",
  "expect-type",
  "jest",
  "no-barrel-files",
  "no-only-tests",
  "simple-import-sort",
  "@typescript-eslint",
  "promise",
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
    "plugin:eslint-comments/recommended",
    "plugin:expect-type/recommended",
    "plugin:jest/recommended",
    "plugin:jest/style",
    "plugin:import/recommended",
    "plugin:n/recommended",
    "plugin:no-use-extend-native/recommended",
    "plugin:security/recommended",
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
        "no-restricted-syntax": baseNoRestrictedSyntax,
      },
    },
    {
      // Enforce that job files are located under the logic folder to follow the three-tier architecture
      files: ["src/modules/**/*.job.ts"],
      rules: {
        "check-file/folder-match-with-fex": [
          "error",
          {
            "*.job.ts": "**/logic/**/",
          },
        ],
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
        ]
      : []),
  ],
  parser: "@typescript-eslint/parser",
  plugins,
  rules: {
    // Start: Deprecated rules removed in v8
    "@typescript-eslint/ban-types": "off",
    "@typescript-eslint/lines-between-class-members": "off",
    "@typescript-eslint/padding-line-between-statements": "off",
    "@typescript-eslint/no-throw-literal": "off",
    // Replacement for `@typescript-eslint/no-throw-literal`
    "@typescript-eslint/only-throw-error": "error",
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
      { argsIgnorePattern: "^_", varsIgnorePattern: "^_", caughtErrorsIgnorePattern: "^_" },
    ],
    "@typescript-eslint/return-await": ["error", "always"],

    // Breaks code when temporarily commented, adding more friction than the value provided.
    "capitalized-comments": "off",

    // Recommends using static fields instead of moving to a function
    "class-methods-use-this": "off",

    // Not worthwhile in TypeScript
    "consistent-return": "off",

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

    // Prevent barrel files to improve build performance and tree-shaking
    "no-barrel-files/no-barrel-files": "error",

    // Set to warn so LLMs to write worse code to get around it
    "no-await-in-loop": "warn",

    // Disallow `.only` in tests to prevent it from making it into `main`.
    "no-only-tests/no-only-tests": "error",

    // Use isDefined() (or sometimes Boolean()) to be explicit and to clarify behavior for "" and 0
    "no-extra-boolean-cast": ["error", { enforceForLogicalOperands: true }],

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
              "date-fns-tz is not allowed. Use @clipboard-health/date-time instead. See https://www.notion.so/BP-Date-Time-2ef8643321f48032ad80e8a5b30aa278 for more information.",
          },
          {
            importNames: ["format"],
            message:
              "Importing `format` from `date-fns` is not allowed. Use @clipboard-health/date-time instead. See https://www.notion.so/BP-Date-Time-2ef8643321f48032ad80e8a5b30aa278 for more information.",
            name: "date-fns",
          },
          {
            name: "moment",
            message:
              "moment is not allowed. Use @clipboard-health/date-time instead. See https://www.notion.so/BP-Date-Time-2ef8643321f48032ad80e8a5b30aa278 for more information.",
          },
          {
            name: "moment-timezone",
            message:
              "moment-timezone is not allowed. Use @clipboard-health/date-time instead. See https://www.notion.so/BP-Date-Time-2ef8643321f48032ad80e8a5b30aa278 for more information.",
          },
        ],
        patterns: [
          {
            group: ["@date-fns/tz"],
            message:
              "@date-fns/tz is not allowed. Use @clipboard-health/date-time instead. See https://www.notion.so/BP-Date-Time-2ef8643321f48032ad80e8a5b30aa278 for more information.",
          },
        ],
      },
    ],

    "no-restricted-properties": [
      "error",
      {
        object: "Object",
        property: "assign",
        message:
          "Use the object spread operator. Object.assign mutates the first argument which is confusing. See https://www.notion.so/BP-TypeScript-Style-Guide-5d4c24aea08a4b9f9feb03550f2c5310?source=copy_link#2568643321f4805ba04ecce1082b2b38 for more information.",
      },
    ],

    "no-restricted-syntax": [
      ...baseNoRestrictedSyntax,
      {
        selector: "TSAsExpression TSTypeReference[typeName.name='TriggerIdempotencyKey']",
        message: triggerIdempotencyKeyMessage,
      },
      {
        selector: "TSTypeAssertion TSTypeReference[typeName.name='TriggerIdempotencyKey']",
        message: triggerIdempotencyKeyMessage,
      },
    ],

    // Use a logger instead.
    "no-console": "error",

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

    // Duplicate
    "n/hashbang": "off",

    // We use TypeScript where these are caught by the compiler
    "no-use-before-define": ["error", { classes: false, functions: false }],

    /*
     * Only enable for properties. Favor arrow functions, they don't have a `this` reference,
     * preventing accidental usage.
     */
    "object-shorthand": ["error", "properties"],

    // Enforces array destructuring. Bad example: `const x = list[0]`, instead do `const [x] = list`
    "prefer-destructuring": ["error", { object: false, array: true }],

    // Force using async/await instead of .then()
    "promise/prefer-await-to-then": ["error", { strict: true }],

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
  },
  settings: { node: { version: ">=24.12.0" } },
};
