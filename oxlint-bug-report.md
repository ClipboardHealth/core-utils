# Empty override for test files suppresses jest/\* category rules when vitest plugin is enabled

## Summary

When the `vitest` plugin is enabled and categories activate `jest/*` rules, adding an override with an empty `rules` object for test file patterns (e.g. `**/*.spec.ts`) selectively suppresses all `jest/*` rules for matched files. Other rules (including `vitest/*`) are unaffected by the override. An empty override should be a no-op.

## Minimal reproduction

Create a project with at least one `.spec.ts` file containing a `describe`/`it` block and a `toEqual` assertion, then use this `.oxlintrc.json`:

```jsonc
// .oxlintrc.json — no extends, no other config files
{
  "categories": { "style": "error" },
  "plugins": ["vitest"],
  "rules": {},
  "overrides": [],
}
```

Run `oxlint --deny-warnings`. Note the `eslint-plugin-jest` errors (e.g. `jest/prefer-strict-equal`, `jest/prefer-lowercase-title`).

Now add an empty override matching test files:

```jsonc
{
  "categories": { "style": "error" },
  "plugins": ["vitest"],
  "rules": {},
  "overrides": [
    {
      "files": ["**/*.spec.ts"],
      "rules": {},
    },
  ],
}
```

Run `oxlint --deny-warnings` again. The `jest/*` errors on `.spec.ts` files are gone.

## Observed behavior

In a monorepo with ~380 files, using `"style": "error"`:

| Config                        | jest errors | vitest errors | all other errors |
| ----------------------------- | ----------- | ------------- | ---------------- |
| No override                   | 512         | 429           | ~3,875           |
| Empty `**/*.spec.ts` override | 68          | 429           | ~3,887           |

- **jest errors** drop by 444 (the remaining 68 are from `*.test.ts` files not matched by the `*.spec.ts` glob)
- **vitest errors** are completely unchanged
- **All other rules** are completely unchanged

The same behavior reproduces with `"nursery": "error"` or any other category.

## Expected behavior

An override with `"rules": {}` should be a no-op — it should not suppress any rules for matched files. The `jest/*` error count should be identical with or without the empty override.

## Additional context

- Removing `vitest` from `plugins` eliminates all `jest/*` errors regardless of overrides, confirming that the `vitest` plugin is what activates `jest/*` rules
- The override suppression is specific to `jest/*` rules — `vitest/*`, `unicorn/*`, `typescript/*`, and all other plugin rules are unaffected
- This appears related to how oxlint internally maps jest rules to vitest, possibly using override file patterns to determine which files should get jest vs vitest treatment
- This may be related to #18518 (excluded plugin rules still applied)

## Environment

- oxlint v1.59.0
- No `extends`, standalone `.oxlintrc.json`
- Reproduces on Linux
