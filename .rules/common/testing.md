---
description: "Writing unit tests: conventions, naming, structure"
---

# Testing

## Unit Tests

Write unit tests for: pure function logic, error paths that are hard to trigger black-box, concurrency scenarios, and behavior with many variations (>5). Otherwise prefer testing through the public contract: service tests (backend) or component integration tests (frontend).

## Conventions

- Use `it` over `test` for test case declarations
- `describe` for grouping
- Arrange-Act-Assert with newlines between
- Variables: `mockX`, `input`, `expected`, `actual`
