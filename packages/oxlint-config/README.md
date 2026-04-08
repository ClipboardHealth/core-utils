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
    "typeCheck": true
  },
  "settings": {
    "node": {
      "version": ">=24.14.0"
    }
  }
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

## What is shared

The `base.json` config includes:

- **Plugins**: eslint, typescript, unicorn, oxc, import, jsdoc, node, promise, vitest
- **Rules**: Opinionated defaults with select rules disabled
- **Overrides**: Root-level files, vitest config, test files, and script files
