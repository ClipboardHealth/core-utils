# CLAUDE.md

This file provides repository-specific guidance to AI agents.

## Architecture

This is an Nx monorepo containing TypeScript libraries and utilities for Clipboard Health. The codebase follows functional programming patterns with strict TypeScript and emphasizes type safety, immutability, and pure functions.

### Key Libraries

- **util-ts**: Core TypeScript utilities including `ServiceResult` (Either type), `ServiceError`, functional utilities (`pipe`, `option`, `either`)
- **testing-core**: Testing utilities and helpers
- **nx-plugin**: Custom Nx generators for project management

## Commands

### Development

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

### Package-specific Commands

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

## Project Structure

Each package in `packages/` has:

- `project.json`: Nx project configuration with build/lint/test targets
- `src/index.ts`: Main export file
- `README.md`: Package-specific documentation with usage examples
- Individual `tsconfig.lib.json`, `jest.config.ts`, etc.

## Development Notes

- The repo uses conventional commits with automated releases
- Code must pass lint, typecheck, and tests before commits
- Use `npm run affected` before opening PRs to verify changes
