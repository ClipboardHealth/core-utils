# Decision Records

## STAFF-533: Do not migrate `analytics` to inferred Nx targets yet

Date: 2026-05-07

Status: Accepted

### Context

`core-utils` currently declares package `build`, `lint`, and `test` targets in
each package `project.json`. `../clipboard` uses inferred TypeScript and Vitest
targets from `nx.json`. STAFF-533 evaluated whether one representative
`core-utils` package can move to inferred `build` and `test` targets without
changing behavior that release and CI depend on.

The POC package was `packages/analytics` because it has standard build and test
targets and real internal build dependencies on `util-ts`, `testing-core`, and
`phone-number`.

### Findings

- Baseline `analytics:build` uses `@nx/js:tsc` with
  `outputPath: dist/packages/analytics` and copies package assets. A clean
  baseline build produced `dist/packages/analytics/package.json`,
  `dist/packages/analytics/README.md`, and compiled files under
  `dist/packages/analytics/src`.
- A scoped `@nx/js/typescript` inferred build target materialized as
  `tsc --build tsconfig.lib.json` from `packages/analytics`, with outputs under
  `dist/out-tsc`. It preserved `dependsOn: ["^build"]`, and Nx still built the
  three package dependencies first.
- The inferred TypeScript target did not create
  `dist/packages/analytics/package.json` or copy `README.md`. This does not
  satisfy the current `nx-release-publish` target, which publishes from
  `dist/packages/{projectName}`.
- Running the inferred TypeScript target normally failed before compilation
  because `@nx/js:typescript-sync` requires a workspace-root `tsconfig.json`.
  This repository uses `tsconfig.base.json`.
- Matching Clipboard's `compiler: "tsgo"` setting did not compile this package:
  `tsgo` rejected the current `baseUrl` and `moduleResolution: "Node10"`
  options inherited from `tsconfig.base.json`.
- A scoped `@nx/vitest` inferred target materialized `analytics:test` as
  `vitest` and added `analytics:test-ci` atomized targets. Running
  `analytics:test --configuration ci --skipNxCache` passed tests but did not
  produce coverage output. Running `analytics:test-ci --skipNxCache` also passed
  without coverage output.
- Nx affected selection was not a separate blocker because the inferred POC kept
  the `build` and `test` target names. The issue is what affected would run:
  affected builds would emit the wrong package shape, and affected CI tests would
  miss coverage unless broader target-default changes were introduced.

### Decision

Do not migrate `packages/analytics` or any other package to inferred
TypeScript/Vitest targets in this ticket.

The inferred targets do not preserve the publishable package shape or CI
coverage behavior without additional repository-wide changes. Those changes
would no longer be a limited one-package POC.

### Follow-up

Revisit inferred targets only with a broader migration plan that explicitly
handles:

- Root TypeScript config compatibility for `@nx/js:typescript-sync`.
- Whether `tsgo` is intended for this repository, or whether inferred builds
  should use `tsc`.
- A replacement for `@nx/js:tsc` asset copying and `dist/packages/{projectName}`
  package layout.
- CI coverage semantics for inferred Vitest targets, including whether global
  `targetDefaults.test` should apply to all packages.
- `nx-release-publish` package root assumptions.
