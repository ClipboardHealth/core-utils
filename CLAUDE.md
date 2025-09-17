# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Architecture

This is an Nx monorepo containing TypeScript libraries and utilities for Clipboard Health. The codebase follows functional programming patterns with strict TypeScript and emphasizes type safety, immutability, and pure functions.

### Key Libraries

- **util-ts**: Core TypeScript utilities including `ServiceResult` (Either type), `ServiceError`, functional utilities (`pipe`, `option`, `either`)
- **json-api**: TypeScript utilities for JSON:API specification compliance
- **json-api-nestjs**: JSON:API utilities specifically for NestJS applications
- **config**: Type-safe configuration management with Zod validation
- **rules-engine**: Pure functional rules engine for business logic
- **testing-core**: Testing utilities and helpers
- **nx-plugin**: Custom Nx generators for project management

### Code Conventions

- Use `function` keyword instead of `const` for function declarations
- Avoid the `any` type
- Prefer interfaces over types
- Avoid enums; use const maps instead
- Use camelCase for files and directories
- Favor `@clipboard-health/util-ts`'s `Either` type (`ServiceResult`) over try/catch for expected errors
- Structure files: constants, types, exported functions, non-exported functions
- Use descriptive variable names with auxiliary verbs (isLoading, hasError)

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

### Testing

- Tests use Jest configuration per package
- Follow Arrange-Act-Assert convention with newlines between sections
- Use `mockX`, `input`, `expected`, `actual` naming convention

## Project Structure

Each package in `packages/` has:

- `project.json`: Nx project configuration with build/lint/test targets
- `src/index.ts`: Main export file
- `README.md`: Package-specific documentation with usage examples
- Individual `tsconfig.lib.json`, `jest.config.ts`, etc.

## Development Notes

- The repo uses conventional commits with automated releases
- All packages follow JSON:API specification where applicable
- NestJS applications use three-tier architecture (controllers → services → repos)
- ts-rest contracts define API schemas using Zod
- Code must pass lint, typecheck, and tests before commits
- Use `npm run affected` before opening PRs to verify changes
