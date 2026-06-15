# @clipboard-health/oxlint-config <!-- omit from toc -->

Shared [Oxlint](https://oxc.rs/docs/guide/usage/linter) configuration for Clipboard Health repositories.

## Table of contents <!-- omit from toc -->

- [Install](#install)
- [Usage](#usage)
- [Categories](#categories)
- [What is shared](#what-is-shared)
- [Intentionally disabled rules](#intentionally-disabled-rules)

## Install

```bash
npm install @clipboard-health/oxlint-config
```

Requires `oxlint >= 1.68.0`: the config references rules that older oxlint versions do not register, which fails config parsing outright.

## Usage

Use the package's TypeScript helper when a repo needs additive composition. Oxlint's built-in `extends` is useful for simple inheritance, but it does not let a repo safely append shared `plugins`, `overrides`, and similar array fields without re-specifying the shared values.

### TypeScript config

Create an `oxlint.config.ts` in your repo root:

```ts
import { base, createOxlintConfig, vitest } from "@clipboard-health/oxlint-config";
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
          version: ">=24.14.0",
        },
      },
    },
    presets: [base, vitest],
  }),
);
```

Available presets:

- `base`
- `react`
- `jest`
- `vitest`

Merge behavior:

- `plugins`, `jsPlugins`, `overrides`, and `ignorePatterns` append in order
- `rules`, `settings`, `options`, `categories`, `env`, and `globals` merge left-to-right
- `localConfig` always wins over preset values when keys conflict

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
      "version": ">=24.14.0"
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

## Categories

This config is tuned for agent-written code: enforce rules that prevent bugs or help agents work faster, ignore rules that only encode human style preferences. Categories are applied as a denylist (enable the category, then disable individual rules that are noise) rather than an allowlist, so new bug-catching rules in a category are adopted automatically as oxlint ships them.

| Category                            | Setting | Why                                                                                                                                                                                                                                                                                                |
| ----------------------------------- | ------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `correctness`, `suspicious`, `perf` | `error` | Likely bugs and performance problems.                                                                                                                                                                                                                                                              |
| `restriction`                       | `error` | Carries high-value guardrails: `typescript/no-explicit-any`, `typescript/no-non-null-assertion`, `no-var`, `unicorn/no-abusive-eslint-disable`.                                                                                                                                                    |
| `pedantic`                          | `error` | Carries `eqeqeq`, the `typescript/no-unsafe-*` family, `typescript/no-misused-promises`, `typescript/switch-exhaustiveness-check`, `array-callback-return`.                                                                                                                                        |
| `style`                             | `off`   | Idiomatic/consistency rules with no bug-prevention value. Rules kept are opted back in explicitly: deliberate consistency picks (`curly`, `no-else-return`) plus bug/security rules oxlint files under `style` (`no-new-func`, `guard-for-in`, `import/no-mutable-exports`, `default-param-last`). |
| `nursery`                           | `off`   | Rules still under development; too unstable for agent-written code.                                                                                                                                                                                                                                |

`style` and `nursery` are off, not denylisted, because their future rules are noise rather than signal — there is nothing worth adopting automatically. Every `style` rule kept is therefore listed explicitly in `base.json`.

## What is shared

The package includes:

- **`base.json`**: the backwards-compatible JSON preset for simple `extends` usage
- **`vitest.json`**: extends `base.json` with the vitest plugin and rules for JSON `extends` usage
- **`base` preset**: shared plugins, rules, and overrides exported for TypeScript composition
- **`react`, `jest`, `vitest` presets**: additive plugin presets for common repo types
- **`createOxlintConfig`**: helper for composing presets with repo-local config

## Intentionally disabled rules

`base.json` cannot hold comments, so the reasoning for non-obvious "off" entries lives here (audited against clipboard-health on oxlint 1.60, 2026-06-11):

- **`typescript/consistent-type-imports`**: oxlint's port is not `emitDecoratorMetadata`-aware (even type-aware with the flag in the tsconfig chain), so it flags NestJS constructor-injected classes as type-only. Applying its fix converts DI tokens to `import type`, which SWC erases from `design:paramtypes` metadata, breaking injection at runtime. Do not enable in NestJS repos until oxlint matches typescript-eslint's decorator handling.
- **`jest/no-confusing-set-timeout`** (jest preset): false-positive explosion — when a jest setup file calls `jest.setTimeout`, the rule flags spec files that contain no `setTimeout` call at all (265k diagnostics across 764 clean files). The vitest preset carries no `jest/*` keys at all: under oxlint ≥1.68 with only the vitest plugin enabled, `jest/*` config keys are silently ignored, and jest-plugin-only rules (such as this one and `jest/prefer-ending-with-an-expect`) cannot fire — `vitest/no-confusing-set-timeout` is not a registered rule name, so an "off" entry for it fails config parsing.
- **`import/no-named-as-default` / `import/no-named-as-default-member`**: low signal; they flag legitimate default-export import patterns far more often than real mistakes (870 hits, ~0 bugs).
- **`prefer-destructuring`**: style preference with no bug-prevention value; not worth the churn as an agent guardrail.

The test-file override in `base.json` disables the `typescript/no-unsafe-*` family, `unbound-method`, `no-non-null-assertion`, and `restrict-template-expressions` for test files: mocks, `expect.any`, and `createMock` make these rules ~90% noise in tests (mirrors the long-standing eslint-config override), while keeping them enforceable for production code.
