# @clipboard-health/oxlint-config <!-- omit from toc -->

Shared [Oxlint](https://oxc.rs/docs/guide/usage/linter) configuration for Clipboard Health repositories.

## Table of contents <!-- omit from toc -->

- [Install](#install)
- [Usage](#usage)
- [Strict presets](#strict-presets)
- [Categories](#categories)
- [What is shared](#what-is-shared)
- [Intentionally disabled rules](#intentionally-disabled-rules)

## Install

```bash
npm install @clipboard-health/oxlint-config
```

The config package includes `@clipboard-health/oxlint-plugin` for presets that use Clipboard Health
custom rules.

Repositories using the `frontend` preset must also install `oxlint-plugin-react-doctor >= 0.9.12`.

Requires `oxlint >= 1.68.0`: the config references rules that older oxlint versions do not register, which fails config parsing outright.

## Usage

Use the package's TypeScript helper when a repo needs additive composition. Oxlint's built-in `extends` is useful for simple inheritance, but it does not let a repo safely append shared `plugins`, `overrides`, and similar array fields without re-specifying the shared values.

### TypeScript config

Create an `oxlint.config.ts` in your repo root:

```ts
import {
  base,
  createOxlintConfig,
  customRules,
  typeAware,
  vitest,
} from "@clipboard-health/oxlint-config";
import { defineConfig } from "oxlint";

export default defineConfig(
  createOxlintConfig({
    localConfig: {
      categories: {
        correctness: "error",
        nursery: "off",
        pedantic: "error",
        perf: "error",
        restriction: "error",
        style: "off",
        suspicious: "error",
      },
      ignorePatterns: [".agents", "coverage/", "node_modules/"],
      options: {
        denyWarnings: true,
        reportUnusedDisableDirectives: "error",
        typeAware: true,
        typeCheck: true,
      },
      rules: {
        "vitest/require-test-timeout": "off",
      },
      settings: {
        node: {
          version: ">=24.14.1",
        },
      },
    },
    presets: [base, customRules, typeAware, vitest],
  }),
);
```

Available presets:

- `base`
- `contractFixtures`
- `customRules`
- `frontend`
- `react`
- `jest`
- `strict` and `strictTypeAware` (opt in; see [Strict presets](#strict-presets))
- `typeAware`
- `vitest`

Merge behavior:

- `plugins`, `jsPlugins`, `overrides`, and `ignorePatterns` append in order
- `rules`, `settings`, `options`, `categories`, `env`, and `globals` merge left-to-right
- `localConfig` always wins over preset values when keys conflict

For React applications, compose the standalone `frontend` policy with the repository's test runner:

```ts
import { createOxlintConfig, frontend, typeAware, vitest } from "@clipboard-health/oxlint-config";
import { defineConfig } from "oxlint";

export default defineConfig(
  createOxlintConfig({
    localConfig: {
      ignorePatterns: ["coverage/"],
    },
    presets: [frontend, typeAware, vitest],
  }),
);
```

Keep repository architecture rules, import restrictions, and additional JavaScript plugins in
`localConfig`.

`base` is the organization-wide general JavaScript and TypeScript policy. `frontend` is the
standalone frontend application policy, including React, accessibility, and browser-facing
JavaScript rules. `typeAware` contains rules that require Oxlint's `--type-aware` mode, and `vitest`
adds the complete Vitest policy. Keep repository-specific exceptions in `localConfig`.

`frontend` registers the built-in `react`, `jsx-a11y`, `import`, `oxc`, `typescript`, and
`unicorn` plugins. `typeAware` registers `typescript`, including when composed with another
plugin preset without `base`.

> [!IMPORTANT]
> Upgrading from versions that omitted these plugin registrations can expose existing lint
> violations. Run normal and type-aware lint when upgrading, and allow enough CI runner memory
> for the newly active type-aware analysis. Existing repo-local registrations can remain.

### JSON config

Create an `.oxlintrc.json` in your repo root:

```json
{
  "$schema": "./node_modules/oxlint/configuration_schema.json",
  "extends": ["./node_modules/@clipboard-health/oxlint-config/src/base.json"],
  "categories": {
    "correctness": "error",
    "nursery": "off",
    "pedantic": "error",
    "perf": "error",
    "restriction": "error",
    "style": "off",
    "suspicious": "error"
  },
  "ignorePatterns": [".agents", "coverage/", "node_modules/"],
  "options": {
    "denyWarnings": true,
    "reportUnusedDisableDirectives": "error",
    "typeAware": true,
    "typeCheck": true
  },
  "settings": {
    "node": {
      "version": ">=24.14.1"
    }
  }
}
```

Use JSON only when simple inheritance is enough. JSON `extends` still works for shared presets, but repo-local array fields like `plugins` and `overrides` will not get the additive merge behavior provided by `createOxlintConfig`.

For repos using Vitest, extend from `vitest.json` instead of `base.json` to include the vitest plugin and rules:

```json
{
  "extends": ["./node_modules/@clipboard-health/oxlint-config/src/vitest.json"]
}
```

Override shared rules as needed:

```json
{
  "extends": ["./node_modules/@clipboard-health/oxlint-config/src/base.json"],
  "rules": {
    "no-console": "off"
  }
}
```

## Strict presets

These rules catch real bugs but fire often in legacy code, so they are opt-in. Adopt them per
repository: add the presets, then suppress existing violations inline in the same change so new
code meets the bar.

| Preset            | Rule                                                   | Catches                                                                                                                                                                                               |
| ----------------- | ------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `strict`          | `@clipboard-health/no-ambiguous-positional-parameters` | Two or more positional parameters where two share a type (callers can swap them) or one is a boolean (unreadable at call sites). A function with a single parameter is exempt, and so are test files. |
| `strictTypeAware` | `typescript/strict-boolean-expressions`                | Truthiness checks on numbers and enums, where `0` reads as missing. Strings stay allowed: treating `""` as missing is usually intended.                                                               |

```ts
presets: [base, customRules, strict, typeAware, strictTypeAware, vitest],
```

Give each suppression a reason: `// oxlint-disable-next-line <rule> -- <reason>`.

## Categories

This config is tuned for agent-written code: enforce rules that prevent bugs or help agents work faster, ignore rules that only encode human style preferences. Categories are applied as a denylist (enable the category, then disable individual rules that are noise) rather than an allowlist, so new bug-catching rules in a category are adopted automatically as oxlint ships them.

| Category                            | Setting | Why                                                                                                                                                                                                                                                                          |
| ----------------------------------- | ------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `correctness`, `suspicious`, `perf` | `error` | Likely bugs and performance problems.                                                                                                                                                                                                                                        |
| `restriction`                       | `error` | Carries high-value guardrails: `typescript/no-explicit-any`, `typescript/no-non-null-assertion`, `no-var`, `unicorn/no-abusive-eslint-disable`.                                                                                                                              |
| `pedantic`                          | `error` | Carries `eqeqeq`, the `typescript/no-unsafe-*` family, `typescript/no-misused-promises`, `typescript/switch-exhaustiveness-check`, `array-callback-return`.                                                                                                                  |
| `style`                             | `off`   | Idiomatic/consistency rules with no bug-prevention value. Rules kept are opted back in explicitly: deliberate consistency picks (`curly`, `no-else-return`) plus bug/security rules oxlint files under `style` (`no-new-func`, `guard-for-in`, `import/no-mutable-exports`). |
| `nursery`                           | `off`   | Rules still under development; too unstable for agent-written code.                                                                                                                                                                                                          |

`style` and `nursery` are off, not denylisted, because their future rules are noise rather than signal — there is nothing worth adopting automatically. Every `style` rule kept is therefore listed explicitly in `base.json`.

## What is shared

The package includes:

- **`base.json`**: the backwards-compatible JSON preset for simple `extends` usage
- **`vitest.json`**: extends `base.json` with the vitest plugin and rules for JSON `extends` usage
- **`base` preset**: shared plugins, rules, and overrides exported for TypeScript composition
- **`frontend` preset**: shared frontend JavaScript, React Doctor, React, and JSX accessibility policy
- **`typeAware` preset**: rules that require Oxlint's type-aware execution mode
- **`react`, `jest`, `vitest` presets**: additive plugin presets for common repo types
- **`contractFixtures` preset**: warning-level enforcement that MSW, Playwright, and exported mock
  fixtures are parsed by producer-owned contract response schemas
- **`customRules` preset**: registers the ESLint-independent Clipboard plugin and reproduces the
  shared controller, module, contract, and cross-contract-import enforcement scopes. The controller
  rule, `enforce-ts-rest-in-controllers`, accepts ts-rest and oRPC handlers; a repository that has
  moved every route to oRPC can reject ts-rest with its
  [`forbidTsRestHandler` option](https://github.com/ClipboardHealth/core-utils/tree/main/packages/eslint-plugin/src/lib/rules/enforce-ts-rest-in-controllers)
- **`createOxlintConfig`**: helper for composing presets with repo-local config

## Switch fallback policy

`typescript/switch-exhaustiveness-check` remains an error with
`considerDefaultExhaustiveForUnions: true`. An explicit `default` defines the policy for unmatched
values: rejecting them, returning an optional result, or applying a fallback can all be intentional.
This also permits defaults for legacy values that runtime data contains but TypeScript does not
represent. The rule still reports omitted union members when a switch has no default.

This is a deliberate tradeoff: adding a union or enum member does not trigger a diagnostic at a
switch that already has a default. Repositories or closed dispatchers that need every new member
reviewed can opt into `considerDefaultExhaustiveForUnions: false` with a local rule override. Keep
runtime fallbacks where their contracts need them; do not introduce throws merely to satisfy a lint
check. An explicit default does not prove that its business policy is correct.

Requiring repeated empty labels before a fallback conflicts with `unicorn/no-useless-switch-case`
and makes `complexity` count those labels as extra paths. Both guards remain enabled. See the
[upstream option documentation](https://typescript-eslint.io/rules/switch-exhaustiveness-check/#considerdefaultexhaustiveforunions)
for the stricter future-member behavior. Upgrade to a published package release before removing a
consumer's local rule disable.

## Intentionally disabled rules

`base.json` cannot hold comments, so the reasoning for non-obvious "off" entries lives here (audited against clipboard-health on oxlint 1.60, 2026-06-11):

- **`no-throw-literal` (TypeScript files only)**: `typescript/only-throw-error` replaces this syntax-only rule and uses types to recognize Error values. The base rule can reject deferred Error values held in typed variables. [The upstream replacement guidance](https://typescript-eslint.io/rules/only-throw-error/) requires disabling the base rule to avoid incorrect diagnostics. The override covers `.ts`, `.tsx`, `.mts`, and `.cts`; JavaScript retains `no-throw-literal`, and TypeScript retains `only-throw-error` for real non-Error throws. Run type-aware lint in CI. After upgrading to a published release with this override, consumers can remove a repository-wide `no-throw-literal: off`; an explicit matching local file override can opt back into the syntax-only rule.
- **`typescript/strict-void-return`**: TypeScript deliberately permits a value-returning function where a `void` callback is expected, because the caller discards the result. This supports ordinary `forEach` callbacks that call `Set.add`, `Map.set`, or `Array.push`, and callback APIs that return a synchronous handle. The rule rejects those valid uses; its `allowReturnAny` option only relaxes `any` returns. Keep `no-misused-promises` and `no-floating-promises` enabled for async misuse. TypeScript still rejects a value returned from a function explicitly declared to return `void`.
- **`typescript/no-unnecessary-template-expression`**: simplifying string expressions inside template literals is a style preference. Explicit string normalization and string-enum formatting are allowed. Keep `restrict-template-expressions` and `no-base-to-string` enabled to detect unsafe interpolation instead.
- **`typescript/no-unnecessary-type-conversion`**: removing `Number`, `String`, `Boolean`, or `.toString()` conversions based on a declared type is a style preference. At boundaries where runtime data does not match its declared type, removal can change the value or its type. Explicit coercion is allowed; it does not replace runtime schema validation or the unsafe-operation guards.
- **`typescript/no-invalid-void-type`**: valid completion APIs use generic calls such as `Promise.withResolvers<void>()` and `http.get<void>()`. Even with `allowInGenericTypeArguments: true`, the rule rejects call-expression type arguments; this restriction is inherited from typescript-eslint, rather than an Oxlint port difference. Changing these APIs to `undefined` can change their public signatures: a `void` resolver permits `resolve()` without an argument. Keep the other TypeScript correctness and unsafe-operation guards enabled.
- **`typescript/consistent-return`**: optional lookups and filtered callbacks legitimately mix bare returns with value returns; the rule also reports catch paths that call a declared `never` helper. Its `treatUndefinedAsUnspecified` option changes how explicit `undefined` is classified, rather than recognizing these contracts. [Upstream recommends](https://typescript-eslint.io/rules/consistent-return/) TypeScript's `noImplicitReturns` compiler option instead. Enable that option and run compiler checks in CI; `strict` alone does not enable it. Repositories without that compiler guard must keep an explicit local `"typescript/consistent-return": "error"` until they adopt a replacement. `array-callback-return` remains enabled for missing callback results. Existing suppressed return-type errors and ambiguous fallthrough contracts remain code debt.
- **`typescript/no-unsafe-enum-comparison`**: named constants such as HTTP statuses are compared with wire numbers and serialized strings. The shared TypeScript guidance also prefers const objects over enums. This rule instead requires matching nominal enum types, rejecting those boundary comparisons and input validation. Disabling it also permits matching raw enum literals: it does not enforce using a named member in that case. The compiler still rejects incompatible distinct enums and out-of-range literals; it does not replace every check this rule can make. Repositories that require nominal enum identity can explicitly set this rule to `"error"` in `localConfig.rules`. The [upstream guidance](https://typescript-eslint.io/rules/no-unsafe-enum-comparison/#when-not-to-use-it) describes this tradeoff; the rule has no configuration option for scalar-boundary comparisons. Other enum guards, including duplicate-value detection, remain enabled.
- **`typescript/consistent-type-imports`**: oxlint's port is not `emitDecoratorMetadata`-aware (even type-aware with the flag in the tsconfig chain), so it flags NestJS constructor-injected classes as type-only. Applying its fix converts DI tokens to `import type`, which SWC erases from `design:paramtypes` metadata, breaking injection at runtime. Do not enable in NestJS repos until oxlint matches typescript-eslint's decorator handling.
- **`jest/no-confusing-set-timeout`** (jest preset): false-positive explosion — when a jest setup file calls `jest.setTimeout`, the rule flags spec files that contain no `setTimeout` call at all (265k diagnostics across 764 clean files). The vitest preset carries no `jest/*` keys at all: under oxlint ≥1.68 with only the vitest plugin enabled, `jest/*` config keys are silently ignored, and jest-plugin-only rules (such as this one and `jest/prefer-ending-with-an-expect`) cannot fire — `vitest/no-confusing-set-timeout` is not a registered rule name, so an "off" entry for it fails config parsing.
- **`import/no-named-as-default` / `import/no-named-as-default-member`**: low signal; they flag legitimate default-export import patterns far more often than real mistakes (870 hits, ~0 bugs).
- **`vitest/no-conditional-in-test`** (vitest preset): the rule treats every conditional inside a test, including nested mock callbacks and table-driven input construction, as a violation. Stateful fakes, concurrency barriers, and conditional fixture properties need branches without weakening the assertions. The rule has no option to distinguish these cases; extracting the same branches into helpers only hides them from its test-ancestor heuristic. Keep `vitest/expect-expect`, `vitest/valid-expect`, and `vitest/require-to-throw-message` enabled to check assertions.
- **`prefer-destructuring`**: style preference with no bug-prevention value; not worth the churn as an agent guardrail.

The following were turned off after an audit of 13 consumer repos (repo-local `"off"` entries, inline disable comments, and a run of the plain `base` + `vitest` presets on 7 repos, 2026-10-14):

- **`no-await-in-loop`**: sequential awaits are usually intentional (rate limits, Mongo sessions, ordering). The rule pushes agents toward `Promise.all`, which can cause concurrency bugs. It had 1,007 inline disables across 9 repos.
- **`node/no-process-env`**: off locally in 8 of 13 repos. Repos that centralize configuration can turn it back on.
- **`oxc/no-map-spread`**: a micro-optimization. Its suggested fix mutates with `Object.assign`.
- **`unicorn/consistent-function-scoping`**: moving closures to module scope often makes code harder to read.
- **`unicorn/no-useless-undefined`**: conflicts with TypeScript signatures that need an explicit `undefined`.
- **Stylistic, in the restriction category**: `no-plusplus`, `typescript/explicit-member-accessibility`, `typescript/no-import-type-side-effects`, `unicorn/import-style`.

The same audit removed the explicit opt-ins for `typescript/array-type` and `unicorn/filename-case`. They are `style` rules, so the `style` category now keeps them off.

When adopting the callback and coercion defaults, first upgrade to a published release containing them, then remove redundant local `off` entries for `typescript/strict-void-return`, `typescript/no-unnecessary-template-expression`, and `typescript/no-unnecessary-type-conversion`. Repositories that require these stricter conventions can opt back in with local `error` overrides. Keep `no-misused-promises` and `no-floating-promises` enabled: allowing discarded synchronous results does not permit unhandled async failures. Keep `restrict-template-expressions` and `no-base-to-string` enabled for unsafe interpolation.

The test-file override in `base.json` disables the `typescript/no-unsafe-*` family, `unbound-method`, `no-non-null-assertion`, and `restrict-template-expressions` for test files: mocks, `expect.any`, and `createMock` make these rules ~90% noise in tests (mirrors the long-standing eslint-config override), while keeping them enforceable for production code.
