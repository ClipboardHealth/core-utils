# @clipboard-health/eslint-plugin <!-- omit from toc -->

Clipboard's [ESLint](https://eslint.org/) plugin.

## Table of contents <!-- omit from toc -->

- [Install](#install)
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

## Local development commands

See [`package.json`](./package.json) `scripts` for a list of commands.
