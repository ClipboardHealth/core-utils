import { RuleTester } from "oxlint/plugins-dev";

import { rules } from "./index";

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

const CASES = [
  { name: "prefer-is-nil", negated: "isDefined", preferred: "isNil" },
  { name: "prefer-is-defined", negated: "isNil", preferred: "isDefined" },
] as const;

for (const { name, negated, preferred } of CASES) {
  const namedImport = `import { ${negated} } from "@clipboard-health/util-ts";`;
  const preferredImport = `import { ${preferred} } from "@clipboard-health/util-ts";`;
  const namespaceImport = 'import * as utilities from "@clipboard-health/util-ts";';
  const error = { messageId: "preferPositiveCheck", data: { preferred, negated } };
  const errors = [error];

  // oxlint-disable-next-line vitest/expect-expect -- RuleTester validates declaratively
  ruleTester.run(name, rules[name], {
    valid: [
      {
        name: "allows positive helper calls",
        code: `${namedImport} ${negated}(value);`,
      },
      {
        name: "leaves the opposite helper to its own rule",
        code: `import { ${preferred} } from "@clipboard-health/util-ts"; !${preferred}(value);`,
      },
      {
        name: "ignores unbound helper names",
        code: `!${negated}(value);`,
      },
      {
        name: "ignores local functions",
        code: `function ${negated}(value) { return value; } !${negated}(value);`,
      },
      {
        name: "ignores helpers from other packages",
        code: `import { ${negated} } from "other-package"; !${negated}(value);`,
      },
      {
        name: "ignores shadowed named imports",
        code: `${namedImport} function check(${negated}) { return !${negated}(value); }`,
      },
      {
        name: "ignores shadowed import aliases",
        code: `import { ${negated} as check } from "@clipboard-health/util-ts"; function run(check) { return !check(value); }`,
      },
      {
        name: "ignores block-scoped shadows",
        code: `${namedImport} { const ${negated} = check; !${negated}(value); }`,
      },
      {
        name: "ignores type-only import declarations",
        code: `import type { ${negated} } from "@clipboard-health/util-ts"; !${negated}(value);`,
      },
      {
        name: "ignores type-only import specifiers",
        code: `import { type ${negated} } from "@clipboard-health/util-ts"; !${negated}(value);`,
      },
      {
        name: "ignores default imports",
        code: `import ${negated} from "@clipboard-health/util-ts"; !${negated}(value);`,
      },
      {
        name: "ignores unrelated object methods",
        code: `${namedImport} !other.${negated}(value);`,
      },
      {
        name: "ignores namespaces from other packages",
        code: `import * as utilities from "other-package"; !utilities.${negated}(value);`,
      },
      {
        name: "ignores shadowed namespace imports",
        code: `${namespaceImport} function check(utilities) { return !utilities.${negated}(value); }`,
      },
      {
        name: "ignores dynamic namespace properties",
        code: `${namespaceImport} !utilities[helperName](value);`,
      },
      {
        name: "ignores type-only namespace imports",
        code: `import type * as utilities from "@clipboard-health/util-ts"; !utilities.${negated}(value);`,
      },
      {
        name: "ignores optional calls",
        code: `${namedImport} !${negated}?.(value);`,
      },
      {
        name: "ignores other unary operators",
        code: `${namedImport} +${negated}(value);`,
      },
      {
        name: "ignores negated references without a call",
        code: `${namedImport} !${negated};`,
      },
    ],
    invalid: [
      {
        name: "reports negated named helper calls",
        code: `${namedImport} !${negated}(value);`,
        errors,
        output: `${preferredImport} ${preferred}(value);`,
      },
      {
        name: "reports aliased helper calls",
        code: `import { ${negated} as check } from "@clipboard-health/util-ts"; !check(value);`,
        errors,
        output: `${preferredImport} ${preferred}(value);`,
      },
      {
        name: "reports string-named imports",
        code: `import { "${negated}" as check } from "@clipboard-health/util-ts"; !check(value);`,
        errors,
        output: `${preferredImport} ${preferred}(value);`,
      },
      {
        name: "reports parenthesized calls",
        code: `${namedImport} !(${negated}(value));`,
        errors,
        output: `${preferredImport} ;(${preferred}(value));`,
      },
      {
        name: "resolves imports declared after their use",
        code: `!${negated}(value); ${namedImport}`,
        errors,
        output: `${preferred}(value); ${preferredImport}`,
      },
      {
        name: "resolves imports through nested scopes",
        code: `${namedImport} function check(value) { return !${negated}(value); }`,
        errors,
        output: `${preferredImport} function check(value) { return ${preferred}(value); }`,
      },
      {
        name: "reports namespace helper calls",
        code: `${namespaceImport} !utilities.${negated}(value);`,
        errors,
        output: `${namespaceImport} utilities.${preferred}(value);`,
      },
      {
        name: "reports static computed namespace helper calls",
        code: `${namespaceImport} !utilities["${negated}"](value);`,
        errors,
        output: `${namespaceImport} utilities["${preferred}"](value);`,
      },
      {
        name: "resolves namespace imports declared after their use",
        code: `!utilities.${negated}(value); ${namespaceImport}`,
        errors,
        output: `utilities.${preferred}(value); ${namespaceImport}`,
      },
      {
        name: "reports each negated call",
        code: `${namedImport} !${negated}(first); !${negated}(second);`,
        errors: [...errors, ...errors],
        output: `${preferredImport} ${preferred}(first); ${preferred}(second);`,
      },
      {
        name: "reuses an existing preferred import alias",
        code: `import { ${negated}, ${preferred} as existing } from "@clipboard-health/util-ts"; !${negated}(value);`,
        errors,
        output: `import {  ${preferred} as existing } from "@clipboard-health/util-ts"; existing(value);`,
      },
      {
        name: "creates a fresh import when the preferred alias is shadowed",
        code: `import { ${negated}, ${preferred} as existing } from "@clipboard-health/util-ts"; function check(existing) { return !${negated}(value); }`,
        errors,
        output: `import { ${preferred}, ${preferred} as existing } from "@clipboard-health/util-ts"; function check(existing) { return ${preferred}(value); }`,
      },
      {
        name: "avoids preferred names shadowed in a nested scope",
        code: `${namedImport} function check(${preferred}) { return !${negated}(value); }`,
        errors,
        output: `import { ${preferred} as ${preferred}2 } from "@clipboard-health/util-ts"; function check(${preferred}) { return ${preferred}2(value); }`,
      },
      {
        name: "avoids names already referenced as globals",
        code: `${namedImport} typeof ${preferred}; !${negated}(value);`,
        errors,
        output: `import { ${preferred} as ${preferred}2 } from "@clipboard-health/util-ts"; typeof ${preferred}; ${preferred}2(value);`,
      },
      {
        name: "does not reuse the preferred helper from another package",
        code: `${namedImport} import { ${preferred} } from "other-package"; !${negated}(value);`,
        errors,
        output: `import { ${preferred} as ${preferred}2 } from "@clipboard-health/util-ts"; import { ${preferred} } from "other-package"; ${preferred}2(value);`,
      },
      {
        name: "does not reuse a preferred type-only import declaration",
        code: `${namedImport} import type { ${preferred} } from "@clipboard-health/util-ts"; !${negated}(value);`,
        errors,
        output: `import { ${preferred} as ${preferred}2 } from "@clipboard-health/util-ts"; import type { ${preferred} } from "@clipboard-health/util-ts"; ${preferred}2(value);`,
      },
      {
        name: "does not reuse a preferred type-only import specifier",
        code: `import { ${negated}, type ${preferred} } from "@clipboard-health/util-ts"; !${negated}(value);`,
        errors,
        output: `import { ${preferred} as ${preferred}2, type ${preferred} } from "@clipboard-health/util-ts"; ${preferred}2(value);`,
      },
      {
        name: "retains an original import used by a positive call",
        code: `${namedImport} ${negated}(first); !${negated}(second);`,
        errors,
        output: `import { ${negated}, ${preferred} } from "@clipboard-health/util-ts"; ${negated}(first); ${preferred}(second);`,
      },
      {
        name: "retains an original import that is exported",
        code: `${namedImport} export { ${negated} }; !${negated}(value);`,
        errors,
        output: `import { ${negated}, ${preferred} } from "@clipboard-health/util-ts"; export { ${negated} }; ${preferred}(value);`,
      },
      {
        name: "retains an original import used by a type query",
        code: `${namedImport} type Check = typeof ${negated}; !${negated}(value);`,
        errors,
        output: `import { ${negated}, ${preferred} } from "@clipboard-health/util-ts"; type Check = typeof ${negated}; ${preferred}(value);`,
      },
      {
        name: "preserves comments around negation and call arguments",
        code: `${namedImport} ! /* reason */ (${negated} /* call */ (/* argument */ value));`,
        errors,
        output: `${preferredImport} ; /* reason */ (${preferred} /* call */ (/* argument */ value));`,
      },
      {
        name: "preserves comments inside an aliased import",
        code: `import { ${negated} /* imported */ as /* alias */ check } from "@clipboard-health/util-ts"; !check(value);`,
        errors,
        output: `import { ${preferred} /* imported */ as /* alias */ ${preferred} } from "@clipboard-health/util-ts"; ${preferred}(value);`,
      },
      {
        name: "preserves comments when removing an original import specifier",
        code: `import { ${negated} /* original */, /* preferred */ ${preferred} } from "@clipboard-health/util-ts"; !${negated}(value);`,
        errors,
        output: `import {  /* original */ /* preferred */ ${preferred} } from "@clipboard-health/util-ts"; ${preferred}(value);`,
      },
      {
        name: "keeps a token separator after return",
        code: `${namedImport} function check(value) { return!${negated}(value); }`,
        errors,
        output: `${preferredImport} function check(value) { return ${preferred}(value); }`,
      },
      {
        name: "preserves automatic semicolon insertion before a parenthesized statement",
        code: `${namedImport}\nprevious()\n!(${negated}(value));`,
        errors,
        output: `${preferredImport}\nprevious()\n;(${preferred}(value));`,
      },
      {
        name: "keeps a parenthesized conditional body attached to its condition",
        code: `${namedImport} if (condition) !(${negated}(value));`,
        errors,
        output: `${preferredImport} if (condition) (${preferred}(value));`,
      },
      {
        name: "does not insert a statement separator inside surrounding parentheses",
        code: `${namedImport} (!(${negated}(value)));`,
        errors,
        output: `${preferredImport} ((${preferred}(value)));`,
      },
      {
        name: "preserves statement boundaries when removing a whole import",
        code: `${preferredImport}\nprevious()\n${namedImport}\n(next)()\n!${negated}(value);`,
        errors,
        output: `${preferredImport}\nprevious()\n;     \n(next)()\n${preferred}(value);`,
      },
      {
        name: "leaves explicit type arguments for manual review",
        code: `${namedImport} !${negated}<Value>(value);`,
        errors,
        output: null,
      },
      {
        name: "preserves generic references while fixing ordinary calls",
        code: `${namedImport} !${negated}<Value>(first); !${negated}(second);`,
        errors: [...errors, ...errors],
        output: `import { ${negated}, ${preferred} } from "@clipboard-health/util-ts"; !${negated}<Value>(first); ${preferred}(second);`,
      },
      {
        name: "combines multiple original aliases into one preferred import",
        code: `import { ${negated} as first, ${negated} as second, keep } from "@clipboard-health/util-ts"; !first(a); !second(b); keep();`,
        errors: [...errors, ...errors],
        output: `import { ${preferred},    keep } from "@clipboard-health/util-ts"; ${preferred}(a); ${preferred}(b); keep();`,
      },
      {
        name: "removes multiple aliases while keeping an existing preferred import",
        code: `import { ${negated} as first, ${negated} as second, ${preferred} } from "@clipboard-health/util-ts"; !first(a); !second(b);`,
        errors: [...errors, ...errors],
        output: `import {       ${preferred} } from "@clipboard-health/util-ts"; ${preferred}(a); ${preferred}(b);`,
      },
      {
        name: "preserves single quotes in computed namespace properties",
        code: `${namespaceImport} !utilities['${negated}'](value);`,
        errors,
        output: `${namespaceImport} utilities['${preferred}'](value);`,
      },
      {
        name: "fixes more calls than the autofix pass limit in one batch",
        code: `${namedImport} ${Array.from({ length: 15 }, (_, index) => `!${negated}(value${index});`).join(" ")}`,
        errors: Array.from({ length: 15 }, () => error),
        output: `${preferredImport} ${Array.from({ length: 15 }, (_, index) => `${preferred}(value${index});`).join(" ")}`,
      },
    ],
  });
}
