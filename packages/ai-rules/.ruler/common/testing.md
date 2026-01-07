# Testing

- Follow the Arrange-Act-Assert convention for tests with newlines between each section.
- Name test variables using the `mockX`, `input`, `expected`, `actual` convention.
- Aim for high test coverage, writing both positive and negative test cases.
- Prefer `it.each` for multiple test cases.
- Avoid conditional logic in tests.

## Running Tests, Linting, and Type Checking

- Always use the scripts defined in the repository's `package.json` file to run tests, linting, and type checking.
- Look at the available npm scripts in `package.json` before running any commands.
- Typical scripts available:
  - **Unit tests**: Usually a `test` script (e.g., `npm run test`) for running unit tests. Specific files or directories can often be passed as arguments.
  - **Service tests**: Usually a separate script (e.g., `npm run test:service` or `npm run service-tests`) for running service/integration tests. Specific files or directories can often be passed as arguments.
  - **Type checking**: Usually a `typecheck` or `tsc` script for running TypeScript type validation.
  - **Linting**: Usually a `lint` script for running the linter.
  - most scripts have variations, specified after columns. For example, `npm run test` also has `npm run test:dir` that supports passing in a directory to test.
