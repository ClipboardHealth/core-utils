# Code style and structure

- Write concise, technical TypeScript code with accurate examples.
- Use functional and declarative programming patterns.
- Prefer iteration and modularization over code duplication.
- Use descriptive variable names with auxiliary verbs (e.g., isLoading, hasError).
- Structure files: constants, types, exported functions, non-exported functions.
- Avoid magic strings and numbers; define constants.
- Use camelCase for files and directories (e.g., modules/shiftOffers.ts).
- When declaring functions, use the `function` keyword, not `const`.
- Files should read from top to bottom: `export`ed items live on top and the internal functions and methods they call go below them.
- Prefer data immutability.

# Commit messages

- Follow the Conventional Commits 1.0 spec for commit messages and in pull request titles.
