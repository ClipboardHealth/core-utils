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

ruleTester.run("no-nullish-coalescing-zero", rule, {
  valid: [
    {
      name: "nullish coalescing with non-zero default",
      code: `const result = value ?? 1;`,
    },
    {
      name: "nullish coalescing with string default",
      code: `const result = value ?? "default";`,
    },
    {
      name: "nullish coalescing with empty string default",
      code: `const result = value ?? "";`,
    },
    {
      name: "nullish coalescing with null default",
      code: `const result = value ?? null;`,
    },
    {
      name: "nullish coalescing with undefined default",
      code: `const result = value ?? undefined;`,
    },
    {
      name: "nullish coalescing with object default",
      code: `const result = value ?? {};`,
    },
    {
      name: "nullish coalescing with array default",
      code: `const result = value ?? [];`,
    },
    {
      name: "nullish coalescing with negative number default",
      code: `const result = value ?? -1;`,
    },
    {
      name: "nullish coalescing with variable default",
      code: `const result = value ?? defaultValue;`,
    },
    {
      name: "logical OR with non-zero default",
      code: `const result = value || 1;`,
    },
    {
      name: "logical AND with non-zero value",
      code: `const result = value && 1;`,
    },
    {
      name: "addition with zero (not nullish coalescing)",
      code: `const result = value + 0;`,
    },
    {
      name: "comparison with zero",
      code: `const result = value === 0;`,
    },
  ],
  invalid: [
    {
      name: "simple nullish coalescing with zero",
      code: `const result = value ?? 0;`,
      errors: [
        {
          messageId: "nullishCoalescingZero",
          line: 1,
          column: 16,
        },
      ],
    },
    {
      name: "nullish coalescing with zero in function return",
      code: `function getValue() { return data ?? 0; }`,
      errors: [
        {
          messageId: "nullishCoalescingZero",
          line: 1,
          column: 30,
        },
      ],
    },
    {
      name: "nullish coalescing with zero in arrow function",
      code: `const getValue = () => data ?? 0;`,
      errors: [
        {
          messageId: "nullishCoalescingZero",
          line: 1,
          column: 24,
        },
      ],
    },
    {
      name: "nullish coalescing with zero in object property",
      code: `const obj = { count: value ?? 0 };`,
      errors: [
        {
          messageId: "nullishCoalescingZero",
          line: 1,
          column: 22,
        },
      ],
    },
    {
      name: "nullish coalescing with zero in array element",
      code: `const arr = [value ?? 0];`,
      errors: [
        {
          messageId: "nullishCoalescingZero",
          line: 1,
          column: 14,
        },
      ],
    },
    {
      name: "nullish coalescing with zero from property access",
      code: `const result = obj.value ?? 0;`,
      errors: [
        {
          messageId: "nullishCoalescingZero",
          line: 1,
          column: 16,
        },
      ],
    },
    {
      name: "nullish coalescing with zero from optional chain",
      code: `const result = obj?.value ?? 0;`,
      errors: [
        {
          messageId: "nullishCoalescingZero",
          line: 1,
          column: 16,
        },
      ],
    },
    {
      name: "nested nullish coalescing with zero",
      code: `const result = a ?? b ?? 0;`,
      errors: [
        {
          messageId: "nullishCoalescingZero",
          line: 1,
          column: 16,
        },
      ],
    },
    {
      name: "nullish coalescing with zero in template literal",
      // eslint-disable-next-line no-template-curly-in-string
      code: "const result = `Count: ${value ?? 0}`;",
      errors: [
        {
          messageId: "nullishCoalescingZero",
          line: 1,
          column: 26,
        },
      ],
    },
    {
      name: "nullish coalescing with zero in function argument",
      code: `doSomething(value ?? 0);`,
      errors: [
        {
          messageId: "nullishCoalescingZero",
          line: 1,
          column: 13,
        },
      ],
    },
    {
      name: "logical OR with zero",
      code: `const result = value || 0;`,
      errors: [
        {
          messageId: "logicalOrZero",
          line: 1,
          column: 16,
        },
      ],
    },
    {
      name: "logical OR with zero in function return",
      code: `function getValue() { return data || 0; }`,
      errors: [
        {
          messageId: "logicalOrZero",
          line: 1,
          column: 30,
        },
      ],
    },
    {
      name: "logical AND with zero",
      code: `const result = value && 0;`,
      errors: [
        {
          messageId: "logicalAndZero",
          line: 1,
          column: 16,
        },
      ],
    },
    {
      name: "logical AND with zero in conditional",
      code: `const result = isValid && 0;`,
      errors: [
        {
          messageId: "logicalAndZero",
          line: 1,
          column: 16,
        },
      ],
    },
  ],
});
