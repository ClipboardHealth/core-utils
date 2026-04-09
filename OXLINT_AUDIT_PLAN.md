# Oxlint Global Disables Audit — Implementation Plan

## Overview

The root `.oxlintrc.json` has 76 globally-disabled rules. This plan addresses them in
4 phases, plus a one-time config cleanup to move shared disables into
`packages/oxlint-config/src/base.json`.

---

## Phase 0: Config Cleanup (no code changes)

Move rules to their correct home and remove duplicates.

### 0a. Move 29 rules into `packages/oxlint-config/src/base.json`

These are opinionated or inapplicable rules that should be disabled across **all** company
projects, not just this repo.

| Rule | Reason |
|------|--------|
| `sort-keys` | Pure style preference; extremely noisy |
| `complexity` | Arbitrary metric limit |
| `max-classes-per-file` | Arbitrary limit |
| `max-depth` | Arbitrary limit |
| `max-params` | Arbitrary limit |
| `typescript/explicit-function-return-type` | TS inference handles this |
| `typescript/explicit-module-boundary-types` | TS inference handles this |
| `typescript/strict-boolean-expressions` | Too strict for most TS code |
| `typescript/parameter-properties` | Style preference; NestJS uses these |
| `typescript/ban-types` | Deprecated/renamed rule |
| `jsdoc/check-tag-names` | Too strict with modern JSDoc |
| `jsdoc/empty-tags` | Minor style issue |
| `jsdoc/require-param` | TS provides type info |
| `jsdoc/require-param-type` | TS provides type info |
| `jsdoc/require-returns` | TS provides type info |
| `jsdoc/require-returns-type` | TS provides type info |
| `import/unambiguous` | Doesn't work with TS/bundlers |
| `import/no-unassigned-import` | Blocks CSS imports, polyfills |
| `unicorn/prefer-top-level-await` | Not all contexts support TLA |
| `unicorn/prefer-bigint-literals` | Niche, rarely applicable |
| `unicorn/no-immediate-mutation` | Too many false positives |
| `vitest/require-test-timeout` | Every test file would be flagged |
| `vitest/require-hook` | Too strict; forces everything into hooks |
| `vitest/require-mock-type-parameters` | Too strict |
| `vitest/consistent-test-filename` | Config-dependent |
| `vitest/prefer-importing-vitest-globals` | Company uses explicit imports |

Note: `max-lines`, `max-lines-per-function`, and `unicorn/no-array-reduce` are already
in base.json — just remove the duplicates from `.oxlintrc.json`.

### 0b. Keep 19 rules disabled in `.oxlintrc.json` (project-specific)

These stay in the root config because they may be worth enabling in other company projects:

`func-style`, `class-methods-use-this`, `import/no-anonymous-default-export`,
`import/no-commonjs`, `import/no-default-export`, `new-cap`, `no-shadow`,
`typescript/no-extraneous-class`, `typescript/no-invalid-void-type`,
`typescript/no-require-imports`, `typescript/dot-notation`,
`typescript/prefer-regexp-exec`, `unicorn/consistent-function-scoping`,
`unicorn/no-anonymous-default-export`, `unicorn/no-array-callback-reference`,
`unicorn/prefer-module`, `promise/always-return`, `vitest/hoisted-apis-on-top`,
`oxc/no-barrel-file`

### 0c. Remove 28 rules from `.oxlintrc.json` (will be enabled in Phases 1–4)

These will be enabled incrementally in the phases below.

---

## Phase 1: Auto-fixable rules (run `--fix`, commit)

Enable these rules and run `npx oxlint --fix` to auto-resolve all violations.
Estimated total: ~250+ violations, all auto-fixed.

| Rule | Est. Violations | Fix Type |
|------|:---:|---|
| `typescript/no-import-type-side-effects` | ~126 | 🛠️ auto-fix |
| `vitest/prefer-to-be-truthy` | ~69 | 🛠️ auto-fix |
| `vitest/prefer-to-be-falsy` | ~42 | 🛠️ auto-fix |
| `typescript/prefer-includes` | ~12 | 🛠️ auto-fix |
| `typescript/array-type` (config: `["error", "array"]`) | N/A | 🛠️ auto-fix |
| `vitest/prefer-expect-type-of` | ~8 | 🛠️ auto-fix |
| `vitest/prefer-called-once` | N/A | 🛠️ auto-fix |
| `vitest/prefer-describe-function-title` | N/A | 🛠️ auto-fix |
| `vitest/prefer-import-in-mock` | N/A | 🛠️ auto-fix |
| `vitest/prefer-strict-boolean-matchers` | N/A | 🛠️ auto-fix |
| `unicorn/prefer-string-raw` | N/A | 🛠️ auto-fix |
| `unicorn/no-array-sort` | N/A | 🛠️ auto-fix |
| `oxc/no-map-spread` | N/A | 🛠️ auto-fix |
| `sort-imports` | ~340 | 🛠️ partial auto-fix |
| `prefer-destructuring` | N/A | 🛠️ partial auto-fix |
| `func-names` | N/A | 🛠️ auto-fix |

**Steps:**
1. Remove these 16 rules from `.oxlintrc.json` `rules` section
2. Run `npx oxlint --fix -c .oxlintrc.json`
3. Run `npm run format` to fix any formatting issues from auto-fix
4. Review diff, manually fix any remaining violations
5. Run `npm run affected` to verify all tests pass
6. Commit: `fix(lint): enable 16 auto-fixable oxlint rules`

---

## Phase 2: Low-count manual fixes (~30 violations)

| Rule | Est. Violations | Fix Type |
|------|:---:|---|
| `prefer-template` | ~2 | 🚧 planned |
| `typescript/no-non-null-assertion` | ~8 | 🚧 planned |
| `prefer-promise-reject-errors` | ~2 | none |
| `no-duplicate-imports` | N/A | none |
| `promise/prefer-await-to-then` | ~6 | none |
| `no-plusplus` | ~5 | 💡 suggestion |
| `oxc/no-accumulating-spread` | ~0 | none |
| `unicorn/no-array-for-each` | ~8 | 🚧 planned |

**Steps:**
1. Remove these 8 rules from `.oxlintrc.json`
2. Run `npx oxlint -c .oxlintrc.json` to identify violations
3. Manually fix all ~30 violations
4. Run `npm run affected` to verify
5. Commit: `fix(lint): enable 8 low-violation oxlint rules`

---

## Phase 3: Medium-effort rules (~30 violations)

| Rule | Est. Violations | Fix Type |
|------|:---:|---|
| `unicorn/no-instanceof-builtins` | ~22 | 💡 suggestion |
| `import/no-namespace` | ~4 | 🚧 planned |

**Steps:**
1. Remove these 2 rules from `.oxlintrc.json`
2. Apply suggestions where possible, manually fix the rest
3. Run `npm run affected` to verify
4. Commit: `fix(lint): enable instanceof-builtins and no-namespace rules`

---

## Phase 4: High-effort incremental enablement

### 4a. `typescript/no-unsafe-type-assertion` (~184 violations)

This aligns with the team's TypeScript rule: "Avoid type assertions (`as`, `!`) unless
absolutely necessary."

**Strategy:** Enable the rule and add inline `// oxlint-disable-next-line` comments for
existing violations. Fix violations file-by-file over time.

1. Enable the rule in `.oxlintrc.json`
2. Run oxlint to get full list of violations
3. Add inline disable comments to each existing violation
4. New code will be enforced; existing code migrates gradually
5. Commit: `chore(lint): enable no-unsafe-type-assertion with inline disables`

### 4b. `node/no-process-env` (~49 violations)

**Strategy:** Enable globally with overrides for files that legitimately use `process.env`
(scripts, config loaders, test support).

1. Remove from `.oxlintrc.json` global rules
2. Add overrides for config/scripts/test-support files
3. Fix remaining violations to use config abstractions
4. Commit: `fix(lint): enable no-process-env with targeted overrides`

---

## Execution Order

```
Phase 0  →  1 PR: config cleanup (move to base.json, remove duplicates)
Phase 1  →  1 PR: auto-fixable rules (run --fix)
Phase 2  →  1 PR: low-count manual fixes
Phase 3  →  1 PR: medium-effort rules
Phase 4a →  1 PR: no-unsafe-type-assertion with inline disables
Phase 4b →  1 PR: no-process-env with overrides
```

Total: 6 PRs, each independently reviewable and shippable.
