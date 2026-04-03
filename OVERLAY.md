This is an Nx monorepo containing TypeScript libraries and utilities for Clipboard.

# Commands

## Development

```bash
# Install dependencies
pnpm install

# Build, lint, and test only changed files from main; MUST run before opening PRs
pnpm run affected

# Format code
pnpm run format

# Check formatting, spelling, etc.
pnpm run ci:check

# Type check (all packages)
pnpm run typecheck

# Lint (oxlint)
pnpm run lint

# Check dependency architecture
pnpm run architecture:check

# Check formatting
pnpm run format:check
```

## Package-specific Commands

```bash
# Install dependency in specific package
pnpm add --filter packages/[PROJECT_NAME] [DEPENDENCY]

# Run specific command against a package
pnpm exec nx run [PROJECT_NAME]:[COMMAND]

# Common targets: build, lint, test
pnpm exec nx run json-api:build
pnpm exec nx run util-ts:test

# For test coverage, run with the "ci" configuration
pnpm exec nx run util-ts:test:ci
```

# Project Structure

Each package in `packages/` has:

- `project.json`: Nx project configuration with build/lint/test targets
- `src/index.ts`: Main export file
- `README.md`: Package-specific documentation with usage examples
- Individual `tsconfig.lib.json`, `jest.config.ts`, etc.

<!-- nx configuration start-->
<!-- Leave the start & end comments to automatically receive updates. -->

# General Guidelines for working with Nx

- For navigating/exploring the workspace, invoke the `nx-workspace` skill first - it has patterns for querying projects, targets, and dependencies
- When running tasks (for example build, lint, test, e2e, etc.), always prefer running the task through `nx` (i.e. `nx run`, `nx run-many`, `nx affected`) instead of using the underlying tooling directly
- Prefix nx commands with the workspace's package manager (e.g., `pnpm exec nx build`, `pnpm exec nx test`) - avoids using globally installed CLI
- You have access to the Nx MCP server and its tools, use them to help the user
- For Nx plugin best practices, check `node_modules/@nx/<plugin>/PLUGIN.md`. Not all plugins have this file - proceed without it if unavailable.
- NEVER guess CLI flags - always check nx_docs or `--help` first when unsure

## Scaffolding & Generators

- For scaffolding tasks (creating apps, libs, project structure, setup), ALWAYS invoke the `nx-generate` skill FIRST before exploring or calling MCP tools

## When to use nx_docs

- USE for: advanced config options, unfamiliar flags, migration guides, plugin configuration, edge cases
- DON'T USE for: basic generator syntax (`nx g @nx/react:app`), standard commands, things you already know
- The `nx-generate` skill handles generator discovery internally - don't call nx_docs just to look up generator syntax

<!-- nx configuration end-->
