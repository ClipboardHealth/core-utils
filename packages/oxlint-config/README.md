# @clipboard-health/oxlint-config <!-- omit from toc -->

Shared [Oxlint](https://oxc.rs/docs/guide/usage/linter) configuration for Clipboard Health repositories.

## Table of contents <!-- omit from toc -->

- [Install](#install)
- [Usage](#usage)
- [What is shared](#what-is-shared)

## Install

```bash
npm install -D oxlint @clipboard-health/oxlint-config
```

If you enable Oxlint's type-aware mode, install `oxlint-tsgolint` too:

```bash
npm install -D oxlint-tsgolint
```

## Usage

Oxlint's `extends` only inherits `rules`, `plugins`, and `overrides`. Properties like `categories`, `options`, `settings`, and `ignorePatterns` must be set in each repo's local config.

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
    "typeCheck": false
  },
  "settings": {
    "node": {
      "version": ">=24.14.0"
    }
  }
}
```

`typeCheck` adds TypeScript compiler diagnostics on top of type-aware lint rules. Start with `typeAware: true` and only enable `typeCheck` once your repo is ready for that stricter mode.

Type-aware linting uses TS7-era config parsing through `tsgolint`. In practice that means avoiding `baseUrl`, using `./`-prefixed `paths`, and not relying on `moduleResolution: "Node10"`.

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

The `base.json` config includes:

- **Plugins**: eslint, typescript, unicorn, oxc, import, jsdoc, node, promise
- **Rules**: Opinionated defaults with select rules disabled
- **Overrides**: Root-level files, vitest config, test files, and script files
