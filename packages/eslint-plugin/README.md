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

## Rules

### `@clipboard-health/no-swallowed-invariant-guard`

Flags a `catch` clause that swallows a failed invariant guard and continues. Guard calls are
identified by function names beginning with `ensure`, `assert`, `throwIf`, `validate`, or `verify`.

The rule allows catches that rethrow, return an error-like value, or explicitly record the violation
with a helper whose name starts with `record` or `report` and includes `Violation`, such as
`recordInvariantViolation`.

Use a standard disable comment for intentional exceptions:

```ts
// eslint-disable-next-line @clipboard-health/no-swallowed-invariant-guard -- reason
```

## Local development commands

See [`package.json`](./package.json) `scripts` for a list of commands.
