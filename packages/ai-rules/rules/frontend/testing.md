---
description: "Writing frontend tests: React Testing Library, component tests"
---

# Testing

Vitest and `@testing-library/react`, with MSW for API mocking. Test files use the `.test.ts`/`.test.tsx` suffix and sit next to the code they cover.

## Philosophy

Focus on integration tests—test how components work together as users experience them.

**Priority:** Static (TS/ESLint) → Integration → Unit (pure utilities only) → E2E (critical flows only)

## Page-Level Tests

Page-level frontend tests must use real hooks and mock only the lowest-level API/network boundary unless isolation is explicitly required.

## Queries

Prefer user-centric queries in priority order: `getByRole`, `getByLabelText`, `getByText`; use `getByTestId` only as a last resort.

## Visibility Assertions

- Use `toBeVisible()` to assert an element is visible in the DOM (rendered and not hidden)
- Use `not.toBeInTheDocument()` to assert an element does not exist in the DOM — do not use `not.toBeVisible()` for this case, as it passes even when the element is present but hidden

## MSW Handlers

Export `create<Thing>Handler` factory functions that take the mock data as an argument, not static handlers — each test needs to vary the response. Register them per test with `mockServer.use(...)`.
