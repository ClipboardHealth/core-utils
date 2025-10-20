# @clipboard-health/eslint-config <!-- omit from toc -->

Our [ESLint](https://eslint.org/) configuration.

## Table of contents <!-- omit from toc -->

- [Install](#install)
- [Local development commands](#local-development-commands)

## Install

```bash
npm install -D @clipboard-health/eslint-config eslint-config-prettier prettier
```

Then, create an `eslint.config.js` file (ESLint 9 flat config format):

```js
const clipboardHealthConfig = require("@clipboard-health/eslint-config");
const prettierConfig = require("eslint-config-prettier");

module.exports = [
  ...clipboardHealthConfig,
  prettierConfig,

  // Project-specific overrides
  {
    files: ["**/*.{ts,tsx,js,jsx}"],
    languageOptions: {
      parserOptions: {
        project: "./tsconfig.lint.json",
        tsconfigRootDir: __dirname,
      },
    },
  },
];
```

**Note:** ESLint 9 uses the new flat config format. The old `.eslintrc.*` format is no longer supported.

## Local development commands

See [`package.json`](./package.json) `scripts` for a list of commands.
