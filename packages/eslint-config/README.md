# @clipboard-health/eslint-config

Shared [ESLint](https://eslint.org/) configuration.

## Table of Contents

- [Install](#install)
- [Local development commands](#local-development-commands)

## Install

```bash
npm install -D @clipboard-health/eslint-config eslint-config-prettier prettier
```

Then, modify your `.eslintrc.js` file:

```js
module.exports = {
  extends: ["@clipboard-health", "prettier"],
  overrides: [
    {
      files: ["*.ts", "*.tsx", "*.js", "*.jsx"],
      parserOptions: {
        project: "tsconfig.lint.json",
        tsconfigRootDir: __dirname,
      },
    },
    {
      files: ["*.spec.ts", "*.spec.tsx", "*.spec.js", "*.spec.jsx"],
      env: {
        jest: true,
      },
    },
  ],
  root: true,
};
```
