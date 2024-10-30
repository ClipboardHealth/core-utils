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

        // Duplication allows verbose test case setups and asserts
        "sonarjs/no-duplicate-string": "off",
      },
    },
    /**
     * Exclude *.dto.ts, null is needed for PATCH endpoints to differentiate empty from optional fields
     * Exclude *.repository.ts, null is needed for our ORMs (prisma and mongoose)
     */
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
  ],
  parser: "@typescript-eslint/parser",
  parserOptions: {
    project: ["tsconfig.json"],
    tsconfigRootDir: __dirname,
  },
  plugins: [
    "expect-type",
    "jest",
    "no-only-tests",
    "simple-import-sort",
    "sonarjs",
    "@typescript-eslint",
  ],
  rules: {
    // See https://github.com/microsoft/TypeScript/wiki/Performance#preferring-interfaces-over-intersections
    "@typescript-eslint/consistent-type-definitions": ["error", "interface"],

    // Too many false positives
    "@typescript-eslint/naming-convention": "off",

    // Makes functional programming difficult
    "@typescript-eslint/no-unsafe-call": "off",

    // Prefer an escape hatch instead of an outright ban
    "@typescript-eslint/no-unused-vars": ["warn", { argsIgnorePattern: "^_" }],
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
        ],
      },
    ],

    // Adapter from Airbnb's config, but allows ForOfStatement.
    // See https://github.com/airbnb/javascript/blob/0f3ca32323b8d5770de3301036e65511c6d18e00/packages/eslint-config-airbnb-base/rules/style.js#L340-L358
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
          "`with` is disallowed in strict mode because it makes code impossible to predict and optimize.",
        selector: "WithStatement",
      },
    ],

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
     * Only enable for properties. Favor arrow functions, they don’t have a `this` reference,
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

    // Our libraries don't use ESM
    "unicorn/prefer-module": "off",

    // Allow common, well understood abbreviations
    "unicorn/prevent-abbreviations": [
      "error",
      { ignore: [/config/i, /params/i, /props/i, /ref/i] },
    ],
  },
  settings: { node: { version: ">=18.15.0" } },
};
