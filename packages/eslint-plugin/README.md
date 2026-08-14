# @clipboard-health/eslint-plugin <!-- omit from toc -->

Clipboard's [ESLint](https://eslint.org/) plugin.

The rule implementations are shared with `@clipboard-health/oxlint-plugin`, so ESLint and Oxlint
consumers execute the same behavior. This compatibility package remains available for repositories
that have not migrated to Oxlint yet.

## Table of contents <!-- omit from toc -->

- [Install](#install)
- [Contract fixture construction](#contract-fixture-construction)
- [Local development commands](#local-development-commands)

## Install

> [!NOTE]
> Take a look at our [eslint-config](https://github.com/ClipboardHealth/core-utils/tree/main/packages/eslint-config) which contains this plugin.
> In most cases you can just use the eslint-config instead of directly installing this plugin.

```bash
npm install -D @clipboard-health/eslint-plugin
```

Then, modify your `.eslintrc.js` file to configure individual rules in this plugin:

```js
module.exports = {
  plugins: ["@clipboard-health"],
  overrides: [
    {
      files: ["**/*.controller.ts", "**/*.controllers.ts"],
      rules: {
        "@clipboard-health/enforce-ts-rest-in-controllers": "error",
      },
    },
  ],
  root: true,
};
```

## Contract fixture construction

`require-contract-fixture-construction` requires MSW and Playwright response fixtures to be
constructed through response schemas imported from `@clipboard-health/contract-*` packages. It
also checks exported fixtures in `testUtils/mocks` modules and rejects fixtures mutated after they
were parsed.

Prefer the `contractFixtures` preset from `@clipboard-health/oxlint-config`. Repositories migrating
an existing fixture backlog should enable the preset's warning baseline, then add local error-level
overrides for each migrated directory.

## Local development commands

See [`package.json`](./package.json) `scripts` for a list of commands.
