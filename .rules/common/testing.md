# Testing

## Unit Tests

Use when: error handling hard to trigger black-box, concurrency scenarios, >5 variations, pure function logic.

## Conventions

- Prefer `it` over `test` for test case declarations
- `describe` for grouping
- Arrange-Act-Assert with newlines between
- Variables: `mockX`, `input`, `expected`, `actual`
- Prefer `it.each` for multiple cases
