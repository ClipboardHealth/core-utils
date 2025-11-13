# Architecture

This is an Nx monorepo containing TypeScript libraries and utilities for Clipboard Health. The codebase follows functional programming patterns with strict TypeScript and emphasizes type safety, immutability, and pure functions.

## Key Libraries

- **util-ts**: Core TypeScript utilities including `ServiceResult` (Either type), `ServiceError`, functional utilities (`pipe`, `option`, `either`)
- **testing-core**: Testing utilities and helpers
- **nx-plugin**: Custom Nx generators for project management

# Commands

## Development

```bash
# Install dependencies
npm install

# Build, lint, and test only changed files from main
npm run affected

# Build, lint, and test everything
npm run all

# Format code
npm run format

# Check formatting, spelling, and run embedex
npm run ci:check
```

## Package-specific Commands

```bash
# Install dependency in specific package
npm install --workspace packages/[PROJECT_NAME] [DEPENDENCY]

# Run specific command against a package
npx nx run [PROJECT_NAME]:[COMMAND]

# Common targets: build, lint, test
npx nx run json-api:build
npx nx run util-ts:test

# For test coverage, run with the "ci" configuration
npx nx run util-ts:test:ci
```

# Project Structure

Each package in `packages/` has:

- `project.json`: Nx project configuration with build/lint/test targets
- `src/index.ts`: Main export file
- `README.md`: Package-specific documentation with usage examples
- Individual `tsconfig.lib.json`, `jest.config.ts`, etc.

# Development Notes

- The repo uses conventional commits with automated releases
- Code must pass lint, typecheck, and tests before commits
- Use `npm run affected` before opening PRs to verify changes

<!-- nx configuration start-->
<!-- Leave the start & end comments to automatically receive updates. -->

# General Guidelines for working with Nx

- When running tasks (for example build, lint, test, e2e, etc.), always prefer running the task through `nx` (i.e. `nx run`, `nx run-many`, `nx affected`) instead of using the underlying tooling directly
- You have access to the Nx MCP server and its tools, use them to help the user
- When answering questions about the repository, use the `nx_workspace` tool first to gain an understanding of the workspace architecture where applicable.
- When working in individual projects, use the `nx_project_details` mcp tool to analyze and understand the specific project structure and dependencies
- For questions around nx configuration, best practices or if you're unsure, use the `nx_docs` tool to get relevant, up-to-date docs. Always use this instead of assuming things about nx configuration
- If the user needs help with an Nx configuration or project graph error, use the `nx_workspace` tool to get any errors

<!-- nx configuration end-->
