<!-- Source: .ruler/common/codeStyleAndStructure.md -->

# Code style and structure

- Write concise, technical TypeScript code with accurate examples.
- Use functional and declarative programming patterns.
- Prefer iteration and modularization over code duplication.
- Use descriptive variable names with auxiliary verbs (e.g., isLoading, hasError).
- Structure files: constants, types, exported functions, non-exported functions.
- Avoid magic strings and numbers; define constants.
- Use camelCase for files and directories (e.g., modules/shiftOffers.ts).
- When declaring functions, use the `function` keyword, not `const`.
- Prefer data immutability.
- Use Conventional Commits 1.0 for commit messages.

<!-- Source: .ruler/common/errorHandlingAndValidation.md -->

# Error handling and validation

- Sanitize user input.
- Handle errors and edge cases at the beginning of functions.
- Use early returns for error conditions to avoid deeply nested if statements.
- Place the happy path last in the function for improved readability.
- Avoid unnecessary else statements; use the if-return pattern instead.
- Use guard clauses to handle preconditions and invalid states early.
- Implement proper error logging and user-friendly error messages.
- Favor `@clipboard-health/util-ts`'s `Either` type for expected errors instead of `try`/`catch`.

<!-- Source: .ruler/common/testing.md -->

# Testing

- Follow the Arrange-Act-Assert convention for tests with newlines between each section.
- Name test variables using the `mockX`, `input`, `expected`, `actual` convention.
- Aim for high test coverage, writing both positive and negative test cases.
- Prefer `it.each` for multiple test cases.
- Avoid conditional logic in tests.

<!-- Source: .ruler/common/typeScript.md -->

# TypeScript usage

- Use strict-mode TypeScript for all code; prefer interfaces over types.
- Avoid enums; use const maps instead.
- Strive for precise types. Look for type definitions in the codebase and create your own if none exist.
- Avoid using type assertions like `as` or `!` unless absolutely necessary.
- Use the `unknown` type instead of `any` when the type is truly unknown.
- Use an object to pass multiple function params and to return results.
- Leverage union types, intersection types, and conditional types for complex type definitions.
- Use mapped types and utility types (e.g., `Partial<T>`, `Pick<T>`, `Omit<T>`) to transform existing types.
- Implement generic types to create reusable, flexible type definitions.
- Utilize the `keyof` operator and index access types for dynamic property access.
- Implement discriminated unions for type-safe handling of different object shapes where appropriate.
- Use the `infer` keyword in conditional types for type inference.
- Leverage `readonly` properties for function parameter immutability.
- Prefer narrow types whenever possible with `as const` assertions, `typeof`, `instanceof`, `satisfies`, and custom type guards.
- Implement exhaustiveness checking using `never`.

<!-- Source: ./OVERLAY.md -->

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
