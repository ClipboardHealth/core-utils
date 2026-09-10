import { RuleTester } from "oxlint/plugins-dev";

import rule from "./index";

RuleTester.describe = (name, run) => {
  describe(name, () => {
    run();
  });
};
RuleTester.it = it;

const ruleTester = new RuleTester({
  eslintCompat: true,
  languageOptions: {
    parserOptions: { lang: "ts" },
    sourceType: "module",
  },
});

// oxlint-disable-next-line vitest/expect-expect -- RuleTester validates declaratively
ruleTester.run("no-empty-boolean-call", rule, {
  valid: [
    {
      name: "Boolean called with an argument",
      code: "const value = Boolean(input);",
    },
    {
      name: "Boolean constructor called with an argument",
      code: "const value = new Boolean(input);",
    },
    {
      name: "Boolean method called without arguments",
      code: "const value = object.Boolean();",
    },
  ],
  invalid: [
    {
      name: "Boolean called without arguments",
      code: "const value = Boolean();",
      errors: [
        {
          messageId: "emptyBooleanCall",
          line: 1,
          column: 15,
        },
      ],
    },
  ],
});
