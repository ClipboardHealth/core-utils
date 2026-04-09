# @clipboard-health/oxlint-config <!-- omit from toc -->

Shared [Oxlint](https://oxc.rs/docs/guide/usage/linter) configuration for Clipboard Health repositories.

## Table of contents <!-- omit from toc -->

- [Install](#install)
- [Usage](#usage)
- [What is shared](#what-is-shared)

## Install

```bash
npm install @clipboard-health/oxlint-config
```

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
        nursery: "error",
        pedantic: "error",
        perf: "error",
        restriction: "error",
        style: "error",
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
    "nursery": "error",
    "pedantic": "error",
    "perf": "error",
    "restriction": "error",
    "style": "error",
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

Use JSON only when simple inheritance is enough. JSON `extends` still works for shared `base.json`, but repo-local array fields like `plugins` and `overrides` will not get the additive merge behavior provided by `createOxlintConfig`.

Override shared rules as needed:

```json
{
  "extends": ["./node_modules/@clipboard-health/oxlint-config/src/base.json"],
  "rules": {
    "no-console": "off"
  }
}
```

## What is shared

The package includes:

- **`base.json`**: the backwards-compatible JSON preset for simple `extends` usage
- **`base` preset**: shared plugins, rules, and overrides exported for TypeScript composition
- **`react`, `jest`, `vitest` presets**: additive plugin presets for common repo types
- **`createOxlintConfig`**: helper for composing presets with repo-local config
