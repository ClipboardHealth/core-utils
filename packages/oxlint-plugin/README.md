# @clipboard-health/oxlint-plugin

Clipboard's custom Oxlint rules. Consumers should normally use the presets exported by
`@clipboard-health/oxlint-config`.

The package is independent of ESLint and `@typescript-eslint`. Its standard `create(context)`
rules are also re-exported by `@clipboard-health/eslint-plugin` for repositories that still use
ESLint.

## Rules

- `enforce-contract-in-controllers`
- `enforce-ts-rest-in-controllers`: deprecated alias of `enforce-contract-in-controllers`, removed
  in the next major version
- `no-ambiguous-positional-parameters`
- `no-empty-boolean-call`
- `no-cross-contract-imports`
- `no-parallel-mongo-session-ops`
- `no-tests-in-contract-packages`
- `no-unindexable-mongo-regex`
- `require-contract-fixture-construction`
- `require-contract-response-parse`
- `require-http-module-factory`
- `require-run-validators-with-upsert`
- `require-to-declared-error`
- `require-zod-import-in-contracts`
- `suppression-policy`

## Configuration

Use the `customRules` preset from `@clipboard-health/oxlint-config` to register the plugin and
apply the shared controller, module, contract, and cross-contract-import scopes. The
`contractFixtures` preset enables fixture-construction checks in tests.

`no-empty-boolean-call`, `require-contract-response-parse`, and
`require-run-validators-with-upsert` are opt-in because their safe adoption scope is
repository-specific.

`customRules` enables `no-tests-in-contract-packages` from `@clipboard-health/oxlint-config` 3.0.0.
It reports only test files inside `packages/contract-*` directories, excluding
`packages/contract-core`.

`no-parallel-mongo-session-ops` is also opt-in. Out of the box it covers `Promise.all`,
`Promise.allSettled`, `Promise.race`, and `Promise.any`. Repositories with their own
bounded-concurrency helpers must name them, or those call sites go unchecked:

```ts
"@clipboard-health/no-parallel-mongo-session-ops": [
  "warn",
  { additionalPrimitives: ["batchPromiseAllWithLimit", "batchPromiseAllSettledWithLimit"] },
],
```

Exclude tests: app-level session objects such as `session.sessionUserId` share the name but are
unrelated to MongoDB sessions.

`no-unindexable-mongo-regex` is opt-in. It reports a MongoDB filter regex that no index can bound:
a case-insensitive one, one not anchored with `^`, or one whose first atom after `^` isn't
literal text, such as `^\s*`. It also reports `new RegExp(value, "i")` built from a runtime value,
because a regex built in one function and queried in another is invisible at the filter. Enable
it on code that queries MongoDB, not on tests. `knownViolations` holds per-file counts for
violations that predate the rule; a listed file may shrink but not grow. A line disabled with an
`oxlint-disable-next-line` or `oxlint-disable-line` directive and a reason is an exception outside
the count:

```ts
"@clipboard-health/no-unindexable-mongo-regex": [
  "error",
  { knownViolations: { "src/users/user.repository.ts": 2 } },
],
```

`require-to-declared-error` is opt-in while services adopt oRPC. In a handler passed to oRPC's
`implement(...).handler()`, every `throw` in a branch that handles a failed `ServiceResult` must
throw `toDeclaredError({ errors, error })` from `@clipboard-health/api-nestjs`, or one of the
handler's `errors` constructors, so the response keeps the status the contract declares. The branch
may still `return`. The rule is syntactic: its file comment lists the conditions it recognizes and
the forms it skips. Enable it on controllers:

```ts
{
  files: ["**/*.controller.ts"],
  rules: { "@clipboard-health/require-to-declared-error": "error" },
},
```

## Suppression policy

`suppression-policy` checks every `eslint-disable*`, `oxlint-disable*`, `@ts-ignore`, and
`@ts-expect-error` comment:

- It forbids suppressing the rules in `NEVER_SUPPRESS_RULES`: `no-debugger`,
  `typescript/no-explicit-any`, `typescript/no-unsafe-{argument,assignment,call,member-access,return}`,
  and `typescript/strict-boolean-expressions`. Aliases such as `@typescript-eslint/no-explicit-any`
  and `eslint/no-debugger` count. The list is fixed; repositories cannot remove rules from it.
- It requires `-- <reason>` on every other directive, and a reason after `@ts-expect-error`.
- It rejects generic reasons, such as a bare TypeScript error code, "legacy", "pre-existing
  complexity", or "Legacy code retains this existing lint violation". A reason that goes on to say
  why the code needs the exception passes.
- It forbids `@ts-ignore`, and any directive that disables `suppression-policy` or
  `unicorn/no-abusive-eslint-disable`.

Enable it with the `suppressionPolicy` preset from `@clipboard-health/oxlint-config`.

### `cb-check-suppressions`

A file-level `/* oxlint-disable @clipboard-health/suppression-policy */` silences the rule for the
whole file, including its report on that comment, and a repository with existing violations cannot
enable the rule yet. The `cb-check-suppressions` CLI covers both. It applies the same policy to
directives added or changed since the merge base, and also reports blanket disables. The rule
writes its findings to a file instead of reporting them to Oxlint, so no inline directive can
silence them. Existing directives are left alone, so it can run in CI before the rule is enabled.

```sh
npx cb-check-suppressions            # compares with the pull request base in GitHub Actions, else origin/HEAD
npx cb-check-suppressions --base origin/main
```

It compares the working tree, including uncommitted and untracked files, and respects the
repository's Oxlint `ignorePatterns`. It exits 1 on a violation. In GitHub Actions, check out with
`fetch-depth: 0` so it can find the merge base.

Both CLIs run from the lint root: the nearest directory from the working directory up to the Git top
level that holds an Oxlint configuration (`.oxlintrc.json`, `.oxlintrc.jsonc`, `oxlint.config.ts` or
`oxlint.config.mts`), else the top level. They resolve Oxlint and read its configuration there and
check only files under it, with paths relative to it. So in a monorepo whose packages each install
and configure Oxlint, run them from the package, as its npm scripts do.

## `cb-lint-ceilings`

Checks, tightens and generates `lint-ceilings.json`, the per-file upper bounds for count rules such
as `max-lines` and `complexity`. See
[Lint ceilings](../oxlint-config/README.md#lint-ceilings) in the config README.

## Deprecated `cbh-*` CLIs

`cbh-check-suppressions` and `cbh-lint-ceilings` are deprecated aliases for `cb-check-suppressions`
and `cb-lint-ceilings`. They print a deprecation notice to stderr and then behave identically. Move
to the `cb-*` names; the aliases will be removed in a future major version.
