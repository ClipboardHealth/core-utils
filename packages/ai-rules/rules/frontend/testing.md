---
description: "Writing frontend tests: React Testing Library, component tests"
---

# Testing

## Philosophy

Focus on integration tests—test how components work together as users experience them.

**Priority:** Static (TS/ESLint) → Integration → Unit (pure utilities only) → E2E (critical flows only)

## Queries

Prefer user-centric queries in priority order: `getByRole`, `getByLabelText`, `getByText`; use `getByTestId` only as a last resort.

## Visibility Assertions

- Use `toBeVisible()` to assert an element is visible in the DOM (rendered and not hidden)
- Use `not.toBeInTheDocument()` to assert an element does not exist in the DOM — do not use `not.toBeVisible()` for this case, as it passes even when the element is present but hidden

## MSW Handlers

Export factory functions, not static handlers:

```typescript
// ✅ Good—flexible per test
export const createUserHandler = (userData: User) =>
  rest.get("/api/user", (req, res, ctx) => res(ctx.json(userData)));

// Usage
mockServer.use(createUserHandler(customData));
```
