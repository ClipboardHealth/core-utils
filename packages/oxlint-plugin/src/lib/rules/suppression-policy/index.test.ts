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
    parserOptions: { lang: "tsx" },
    sourceType: "module",
  },
});

ruleTester.run("suppression-policy", rule, {
  valid: [
    {
      name: "next-line directive with a specific reason",
      code: "// oxlint-disable-next-line no-console -- CLI entry point prints usage to stdout.\nconsole.log(1);",
    },
    {
      name: "eslint prefix and several rules with a reason",
      code: "/* eslint-disable no-console, no-alert -- Debug overlay for local builds only. */",
    },
    {
      name: "reason directly after the keyword leaves no rule names",
      code: "/* eslint-disable -- Generated file. */",
    },
    {
      name: "trailing same-line directive with a reason",
      code: "console.log(1); // oxlint-disable-line no-console -- Prints the generated report path.",
    },
    {
      name: "reason that mentions history but says why this code needs the exception",
      code: "// oxlint-disable-next-line complexity -- pre-existing complexity: this method fans out across ack/upload/skip/override sub-flows; extracting each is a follow-up.\nfunction f() {}",
    },
    ...[
      "Pre-existing complexity because this switch dispatches nine event types.",
      "Legacy: v1 webhook payloads are untyped and v2 replaces them.",
      "https://github.com/oxc-project/oxc/issues/12345",
    ].map((reason) => ({
      name: `specific reason "${reason}"`,
      code: `// oxlint-disable-next-line complexity -- ${reason}\nfunction f() {}`,
    })),
    {
      name: "reason that starts with legacy and explains the exception",
      code: "// oxlint-disable-next-line typescript/no-deprecated -- Legacy claim errors have no contract schema.\nf();",
    },
    {
      name: "short but specific reason",
      code: "// oxlint-disable-next-line typescript/no-non-null-assertion -- guarded above\nf();",
    },
    {
      name: "ts-expect-error with a reason",
      code: "// @ts-expect-error TS2322 -- The SDK types omit the optional region field.\nconst x: number = '1';",
    },
    {
      name: "enable directives need no reason",
      code: "/* eslint-enable no-console */",
    },
    {
      name: "ordinary comments that mention directives",
      code: "// Use oxlint-disable-next-line sparingly.\nconst x = 1;",
    },
    {
      name: "blanket disable is left to unicorn/no-abusive-eslint-disable",
      code: "/* oxlint-disable */",
    },
    {
      name: "a rule outside the never-suppress list",
      code: "// oxlint-disable-next-line no-console -- The worker writes its progress to stdout.\nconsole.log(1);",
    },
  ],
  invalid: [
    {
      name: "directive without a reason",
      code: "// oxlint-disable-next-line no-console\nconsole.log(1);",
      errors: [{ messageId: "missingReason" }],
    },
    {
      name: "reason separator without text",
      code: "// eslint-disable-next-line no-console --\nconsole.log(1);",
      errors: [{ messageId: "missingReason" }],
    },
    ...[
      "typescript/no-explicit-any",
      "@typescript-eslint/no-explicit-any",
      "typescript/no-unsafe-member-access",
      "typescript/no-unsafe-call",
      "typescript/no-unsafe-assignment",
      "typescript/no-unsafe-return",
      "typescript/no-unsafe-argument",
      "typescript/strict-boolean-expressions",
      "no-debugger",
      "eslint/no-debugger",
    ].map((forbidden) => ({
      name: `never-suppress rule ${forbidden}`,
      code: `// oxlint-disable-next-line ${forbidden} -- The upstream SDK ships no types for this call.\nf();`,
      errors: [{ messageId: "forbiddenRule" as const, data: { rule: forbidden } }],
    })),
    {
      name: "disabling the policy itself",
      code: "/* oxlint-disable @clipboard-health/suppression-policy -- Generated file. */",
      errors: [{ messageId: "policyRule" }],
    },
    {
      name: "disabling the blanket-disable guard",
      code: "/* oxlint-disable unicorn/no-abusive-eslint-disable -- Generated file. */",
      errors: [{ messageId: "policyRule" }],
    },
    ...[
      "Legacy code retains this existing lint violation.",
      "Legacy code retains these existing unsafe assertions.",
      "DEVOP-5573: pre-existing complexity",
      "DEVOP-5573: pre-existing file over the 1000-line limit",
      "pre-existing",
      "existing code",
      "Legacy Redux import; remove this directive when the import is removed.",
      "legacy, use @clipboard-health/date-time",
      "Legacy truthiness check predates this rule; compare explicitly when you change it.",
      "TS2322",
      "noUncheckedIndexedAccess",
      "ditto",
      "see above",
      "Legacy: pre-existing",
      "legacy: ok",
      "DEVOP-5573: pre-existing complexity, to be refactored",
    ].map((reason) => ({
      name: `generic reason "${reason}"`,
      code: `// oxlint-disable-next-line no-console -- ${reason}\nconsole.log(1);`,
      errors: [{ messageId: "bannedReason" as const }],
    })),
    {
      name: "ts-ignore",
      code: "// @ts-ignore The SDK types omit the optional region field.\nconst x: number = '1';",
      errors: [{ messageId: "tsIgnore" }],
    },
    {
      name: "ts-expect-error without a reason",
      code: "// @ts-expect-error\nconst x: number = '1';",
      errors: [{ messageId: "missingReason" }],
    },
    {
      name: "ts-expect-error with only an error code",
      code: "// @ts-expect-error TS2322\nconst x: number = '1';",
      errors: [{ messageId: "bannedReason" }],
    },
    {
      name: "forbidden rule reported alongside a missing reason",
      code: "// oxlint-disable-next-line no-console, typescript/no-explicit-any\nconst x: any = 1;",
      errors: [{ messageId: "forbiddenRule" }, { messageId: "missingReason" }],
    },
  ],
});
