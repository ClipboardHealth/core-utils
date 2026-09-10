---
description: "Writing frontend tests: React Testing Library, component tests"
---

# Testing

Vitest and `@testing-library/react`, with MSW for API mocking. Test files use the `.test.ts`/`.test.tsx` suffix and sit next to the code they cover.

## Philosophy

Test components together as users experience them; isolate pure logic only when that is the clearest public seam.

**Priority:** Static (TS/ESLint) → Unit, component, and contract (most tests) → E2E (registered critical flows only)

For contract tests and API-backed component tests, follow [Contract-Derived Response Fixtures](dataFetching.md#contract-derived-response-fixtures).

## Page-Level Tests

Page-level frontend tests must use real hooks and mock only the lowest-level API/network boundary unless isolation is explicitly required.

## Queries

Prefer user-centric queries in priority order: `getByRole`, `getByLabelText`, `getByText`; use `getByTestId` only as a last resort.

## Visibility Assertions

- Use `toBeVisible()` to assert an element is visible in the DOM (rendered and not hidden)
- Use `not.toBeInTheDocument()` to assert an element does not exist in the DOM — do not use `not.toBeVisible()` for this case, as it passes even when the element is present but hidden

## MSW Handlers

Export `create<Thing>Handler` factory functions that take the mock data as an argument, not static handlers — each test needs to vary the response. Register them per test with `mockServer.use(...)`.
