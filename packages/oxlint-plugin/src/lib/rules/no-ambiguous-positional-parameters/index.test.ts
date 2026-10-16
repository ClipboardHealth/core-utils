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

ruleTester.run("no-ambiguous-positional-parameters", rule, {
  valid: [
    {
      name: "single object parameter",
      code: "function getShift(params: { shiftId: string; workerId: string }) { return params; }",
    },
    {
      name: "positional parameters with distinct types",
      code: "function charge(amount: Money, account: Account) { return amount; }",
    },
    {
      name: "TypeScript this parameter is not counted",
      code: "function bound(this: Window, id: string) { return id; }",
    },
    {
      name: "a lone boolean parameter reads clearly enough",
      code: "function setVisible(isVisible: boolean) { return isVisible; }",
    },
    {
      name: "destructured parameters are named by the caller",
      code: "function merge({ a }: Left, { b }: Left) { return a + b; }",
    },
    {
      name: "symmetric comparator parameters",
      code: "function compareLicenses(left: License, right: License): number { return 0; }",
    },
    {
      name: "symmetric equality parameters",
      code: "function isSame(a: string, b: string) { return a === b; }",
    },
    {
      name: "untyped parameters carry no type to compare",
      code: "function legacy(a, b) { return a + b; }",
    },
    {
      name: "inline callback passed to a call",
      code: "const labels = items.map((item: string, label: string) => item + label);",
    },
    {
      name: "callback passed to a constructor",
      code: "const promise = new Promise((resolve: Done, reject: Done) => { resolve(); });",
    },
    {
      name: "variable whose type annotation dictates the signature",
      code: "const compare: Comparator = (left: string, right: string) => left.localeCompare(right);",
    },
    {
      name: "class constructor with injected dependencies",
      code: "class Service { constructor(private readonly a: Client, private readonly b: Client) {} }",
    },
    {
      name: "override method implementing a framework contract",
      code: "class Filter extends Base { override handle(left: string, right: string) {} }",
    },
    {
      name: "object literal arrow property",
      code: "const api = { register: (priority: number, order: number) => {} };",
    },
    {
      name: "function type in an interface",
      code: "interface Props { onRequest?: (workerId: string, facilityId: string) => void; }",
    },
    {
      name: "overload signature",
      code: "declare function pad(text: string, fill: string): string;",
    },
  ],
  invalid: [
    {
      name: "two string parameters",
      code: "function assign(workerId: string, facilityId: string) { return workerId; }",
      errors: [{ messageId: "interchangeableParameters", line: 1, column: 17 }],
    },
    {
      name: "optional and nullable members normalize to the same type",
      code: "function parseAmount(text: string, thousands?: string | undefined) { return text; }",
      errors: [{ messageId: "interchangeableParameters" }],
    },
    {
      name: "same named type",
      code: "function transfer(source: Account, destination: Account) { return source; }",
      errors: [{ messageId: "interchangeableParameters" }],
    },
    {
      name: "symmetric names in the wrong order are not exempt",
      code: "function diff(right: string, left: string) { return left + right; }",
      errors: [{ messageId: "interchangeableParameters" }],
    },
    {
      name: "positional boolean with a type annotation",
      code: "export function getLocation(id: string, includeArchived: boolean) { return id; }",
      errors: [{ messageId: "booleanParameter" }],
    },
    {
      name: "positional boolean from a default value",
      code: "const renderAt = (pathname: string, isEnabled = true) => pathname;",
      errors: [{ messageId: "booleanParameter" }],
    },
    {
      name: "class method",
      code: "class Service { async enrich(context: string, message: string) {} }",
      errors: [{ messageId: "interchangeableParameters" }],
    },
    {
      name: "class arrow property",
      code: "class Service { private readonly build = (id: string, kind: string) => id; }",
      errors: [{ messageId: "interchangeableParameters" }],
    },
    {
      name: "report covers a multi-line parameter list",
      code: "function load(\n  threadId: string,\n  mailboxId: string,\n) { return threadId; }",
      errors: [{ messageId: "interchangeableParameters", line: 2, endLine: 3 }],
    },
  ],
});
