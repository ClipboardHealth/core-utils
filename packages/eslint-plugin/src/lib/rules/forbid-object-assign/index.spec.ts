import { TSESLint } from "@typescript-eslint/utils";

import rule from "./index";

// eslint-disable-next-line n/no-unpublished-require
const parser = require.resolve("@typescript-eslint/parser");

const ruleTester = new TSESLint.RuleTester({
  parser,
  parserOptions: {
    ecmaVersion: 2020,
    sourceType: "module",
  },
});

ruleTester.run("forbid-object-assign", rule, {
  valid: [
    {
      /* While we may want to eventually disallow ALL object.assign usages, this one is not as bad
       * since we don't confusingly use the return value. We are only using this function for its
       * ability to mutate the first argument.
       */
      name: "Object.assign used only to assign",
      code: `Object.assign(env, mapToString(process.env));`,
    },
    {
      name: "invoking a function called assign on a different object should not error",
      code: `const x = MyObject.assign(y, {a: 2});
         const z = object.assign(y, {a: 2});`,
    },
  ],
  invalid: [
    {
      name: "Object.assign used in a variable declaration -- Example from production code",
      code: `const forbiddenError = Object.assign(new Error("Forbidden"), { status: 403 });`,
      errors: [
        {
          messageId: "objectAssignReturnValueUsed",
          line: 1,
          column: 24,
        },
      ],
    },
    {
      name: "Object.assign used in a variable declaration simple",
      code: `const x = Object.assign(y, {a: 2});`,
      errors: [
        {
          messageId: "objectAssignReturnValueUsed",
          line: 1,
          column: 11,
        },
      ],
    },
    {
      name: "Object.assign used in a variable declaration with casting",
      code: `const x = Object.assign(y, { data: 5 }) as CoolType;`,
      errors: [
        {
          messageId: "objectAssignReturnValueUsed",
          line: 1,
          column: 11,
        },
      ],
    },
    {
      name: "Object.assign used in a variable reassignment",
      code: `let x = {a: 1, b: 100};
         let c;
         c = Object.assign(x, {b:2}); // we want to forbid this because x is mutated as well`,
      errors: [
        {
          messageId: "objectAssignReturnValueUsed",
          line: 3,
          column: 14,
        },
      ],
    },
    {
      name: "Object.assign used in a variable reassignment with casting",
      code: `let x = {a: 1, b: 100};
         let c;
         c = Object.assign(x, {b:2}) as SomeType; // we want to forbid this because x is mutated`,
      errors: [
        {
          messageId: "objectAssignReturnValueUsed",
          line: 3,
          column: 14,
        },
      ],
    },
    {
      name: "Object.assign used in function return statement -- Example from production code",
      code: `return Object.assign({}, ...bansCount) as Record<PlacementCandidateBanAction, number>;`,
      errors: [
        {
          messageId: "objectAssignReturnValueUsed",
          line: 1,
          column: 8,
        },
      ],
    },
    {
      name: "Object.assign used in function return statement -- simple example",
      code: `return Object.assign(x, {a:2});`,
      errors: [
        {
          messageId: "objectAssignReturnValueUsed",
          line: 1,
          column: 8,
        },
      ],
    },
    {
      name: "Object.assign used in the left side of a member expression",
      code: `Object.assign(x, {a:2}).a;`,
      errors: [
        {
          messageId: "objectAssignReturnValueUsed",
          line: 1,
          column: 1,
        },
      ],
    },
    {
      name: "Object.assign used in the left side of a member expression with casting",
      code: `(Object.assign(x, {a:2}) as R).a;`,
      errors: [
        {
          messageId: "objectAssignReturnValueUsed",
          line: 1,
          column: 2,
        },
      ],
    },
    {
      name: "Object.assign used in a variable declaration in parenthetical expression",
      code: `const x = (Object.assign(y, {a: 2}));`,
      errors: [
        {
          messageId: "objectAssignReturnValueUsed",
          line: 1,
          column: 12,
        },
      ],
    },
    {
      name: "Object.assign used in a variable declaration in non null expression",
      code: `const x = (Object.assign(y, {a: 2}))!;`,
      errors: [
        {
          messageId: "objectAssignReturnValueUsed",
          line: 1,
          column: 12,
        },
      ],
    },
    {
      name: "Object.assign used in template literal",
      // eslint-disable-next-line no-template-curly-in-string
      code: "`${Object.assign({}, {a:2})}`.length()",
      errors: [
        {
          messageId: "objectAssignReturnValueUsed",
          line: 1,
          column: 4,
        },
      ],
    },
    {
      name: "Object.assign used in array",
      code: "const x = [Object.assign({}, {a:2})]",
      errors: [
        {
          messageId: "objectAssignReturnValueUsed",
          line: 1,
          column: 12,
        },
      ],
    },
    {
      name: "Object.assign used in array spread operator",
      code: "const x = [...Object.assign({}, {a:2})]",
      errors: [
        {
          messageId: "objectAssignReturnValueUsed",
          line: 1,
          column: 15,
        },
      ],
    },
  ],
});
