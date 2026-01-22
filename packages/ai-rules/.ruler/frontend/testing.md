# Testing Standards

## The Testing Trophy Philosophy

Our testing strategy follows the **Testing Trophy** model:

```text
        /\_
       /E2E\         ← End-to-End (smallest layer)
      /-----\
     / Integ \       ← Integration (largest layer - FOCUS HERE!)
    /---------\
   /   Unit    \     ← Unit Tests (helpers/utilities only)
  /-------------\
 /    Static     \   ← TypeScript + ESLint (foundation)
```

**Investment Priority:**

1. **Static** (TypeScript/ESLint) - Free confidence, catches typos and type errors
2. **Integration** - Most valuable, test how components work together as users experience them
3. **Unit** - For pure helpers/utilities, NOT UI components
4. **E2E** - Critical user flows only, slow and expensive

**Key Principle:** Test as close to how users interact with your app as possible. Users don't shallow-render components or call functions in isolation - they interact with features.

## Technology Stack

- **Vitest** for test runner
- **@testing-library/react** for component testing
- **@testing-library/user-event** for user interactions
- **Mock Service Worker (MSW)** for API mocking

## Core Rules

1. **Use MockAppWrapper** for all component/hook tests (QueryClient, Router, Theme)
2. **Use MSW handler factories** (not inline handlers per test)
3. **Test user behavior** (not implementation details)
4. **Use proper async** (act(), waitFor(), await)
5. **Query priority:** getByRole > getByLabel > getByText > getByTestId (last resort)

## Test Structure Template

```typescript
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, beforeEach } from "vitest";

describe("ComponentName", () => {
  beforeEach(() => {
    // Setup if needed
  });

  it("should [behavior] when [condition]", async () => {
    // Arrange
    const user = userEvent.setup();
    render(<Component />, { wrapper: MockAppWrapper });

    // Act
    await user.click(screen.getByRole("button", { name: "Submit" }));

    // Assert
    await waitFor(() => {
      expect(screen.getByText("Success")).toBeInTheDocument();
    });
  });
});
```

## Before/After Anti-Patterns

### Component Rendering

```typescript
// ❌ WRONG: Manual QueryClient setup
const queryClient = new QueryClient();
render(
  <QueryClientProvider client={queryClient}>
    <Component />
  </QueryClientProvider>
);

// ✅ CORRECT: Use MockAppWrapper
render(<Component />, { wrapper: MockAppWrapper });
```

### Hook Testing

```typescript
// ❌ WRONG: No wrapper
const { result } = renderHook(() => useGetData());

// ✅ CORRECT: Use MockAppWrapper
const { result } = renderHook(() => useGetData(), { wrapper: MockAppWrapper });
```

### MSW Handlers

```typescript
// ❌ WRONG: Inline handler per test
beforeEach(() => {
  mockApiServer.use(
    rest.get("/api/resource", (req, res, ctx) =>
      res(ctx.json({ id: "1", name: "Test" }))
    )
  );
});

// ✅ CORRECT: Factory function
// In api/testUtils/handlers.ts
export const createResourceHandler = (data: Resource) =>
  rest.get("/api/resource", (req, res, ctx) => res(ctx.json(data)));

// In test file
mockApiServer.use(createResourceHandler({ id: "1", name: "Test" }));
```

### Query Elements

```typescript
// ❌ WRONG: Testing implementation details
expect(container.querySelector(".css-class")).toBeTruthy();
expect(wrapper.find("UserCard").prop("user")).toBe(mockUser);

// ✅ CORRECT: Test user-visible behavior
expect(screen.getByRole("button", { name: "Submit" })).toBeInTheDocument();
expect(screen.getByText("John Doe")).toBeInTheDocument();
```

## Query Priority

Follow Testing Library's query priority for accessibility:

1. **`getByRole`** - Best for accessibility (buttons, links, inputs)
2. **`getByLabelText`** - For form fields with labels
3. **`getByPlaceholderText`** - For inputs without labels
4. **`getByText`** - For non-interactive content
5. **`getByTestId`** - ⚠️ **LAST RESORT** - Use only when no other option exists

```typescript
// ✅ Prefer accessible queries
screen.getByRole("button", { name: /submit/i });
screen.getByLabelText("Email address");
screen.getByText("Welcome back");

// ❌ Avoid CSS selectors and test IDs unless absolutely necessary
screen.getByTestId("custom-element");  // Last resort only
```

## MSW Handler Factory Pattern

**Always export factory functions, not static handlers**. This allows tests to customize mock responses.

```typescript
// api/testUtils/handlers.ts

// ✅ GOOD: Factory function (flexible per test)
export const createUserHandler = (userData: User) =>
  rest.get("/api/user/:id", (req, res, ctx) => {
    return res(ctx.status(200), ctx.json(userData));
  });

// Export default success scenario for convenience
export const userHandlers = [
  createUserHandler({ id: "1", name: "Default User" })
];

// ❌ BAD: Static handler (ties tests to single response)
export const userSuccessHandler = rest.get("/api/user/:id",
  (req, res, ctx) => res(ctx.json(fixedUser))
);
```

**Usage in tests:**

```typescript
it("should display custom user data", async () => {
  const customUser = { id: "2", name: "Custom User" };
  mockApiServer.use(createUserHandler(customUser));

  render(<UserProfile userId="2" />, { wrapper: MockAppWrapper });

  expect(await screen.findByText("Custom User")).toBeInTheDocument();
});
```

## Common Test Scenarios

### Testing Loading States

```typescript
it("should show loading spinner when data is fetching", () => {
  render(<Component />, { wrapper: MockAppWrapper });
  expect(screen.getByRole("progressbar")).toBeInTheDocument();
});
```

### Testing Error States

```typescript
it("should display error message when API call fails", async () => {
  mockApiServer.use(
    rest.get("/api/data", (req, res, ctx) =>
      res(ctx.status(500), ctx.json({ error: "Server error" }))
    )
  );

  render(<Component />, { wrapper: MockAppWrapper });

  expect(await screen.findByText("Error loading data")).toBeInTheDocument();
});
```

### Testing User Interactions

```typescript
it("should handle form submission", async () => {
  const user = userEvent.setup();
  render(<Form />, { wrapper: MockAppWrapper });

  await user.type(screen.getByLabelText("Name"), "John Doe");
  await user.click(screen.getByRole("button", { name: "Submit" }));

  await waitFor(() => {
    expect(screen.getByText("Success")).toBeInTheDocument();
  });
});
```

### Testing Conditional Rendering

```typescript
it("should show premium badge when user is premium", () => {
  render(<UserCard isPremium={true} />, { wrapper: MockAppWrapper });
  expect(screen.getByText("Premium")).toBeInTheDocument();
});

it("should not show premium badge when user is not premium", () => {
  render(<UserCard isPremium={false} />, { wrapper: MockAppWrapper });
  expect(screen.queryByText("Premium")).not.toBeInTheDocument();
});
```

## Test Naming Conventions

### Describe Blocks

```typescript
describe("ComponentName", () => {
  describe("when condition is met", () => {
    it("should display expected behavior", () => {
      // ...
    });
  });
});
```

### Test Names

Pattern: `'should [expected behavior] when [condition]'`

```typescript
// ✅ Good - descriptive and specific
it("should show loading spinner when data is fetching", () => {});
it("should display error message when API call fails", () => {});
it("should enable submit button when form is valid", () => {});

// ❌ Avoid - vague or incomplete
it("works", () => {});
it("loading state", () => {});
```

## Async Testing

### Using waitFor

```typescript
it("should display data after loading", async () => {
  render(<AsyncComponent />, { wrapper: MockAppWrapper });

  expect(screen.getByText("Loading...")).toBeInTheDocument();

  await waitFor(() => {
    expect(screen.getByText("Data loaded")).toBeInTheDocument();
  });
});
```

### Using findBy Queries

```typescript
it("should display user name", async () => {
  render(<UserProfile />, { wrapper: MockAppWrapper });

  // findBy automatically waits
  const name = await screen.findByText("John Doe");
  expect(name).toBeInTheDocument();
});
```

## What to Test

### ✅ Do Test

- **Integration tests for features** - Multiple components working together
- **Unit tests for helpers/utilities** - Pure business logic
- **All states** - Loading, success, error
- **User interactions** - Clicks, typing, form submissions
- **Conditional rendering** - Different states/permissions

### ❌ Don't Test

- **UI components in isolation** - Users never shallow-render
- **Implementation details** - Internal state, function calls
- **Third-party libraries** - Trust they're tested
- **Styles/CSS** - Visual regression tests are separate

## Parameterized Tests

```typescript
it.each([
  { input: { isUrgent: true }, expected: "URGENT" },
  { input: { isUrgent: false }, expected: "REGULAR" }
])("should return $expected when isUrgent is $input.isUrgent", ({ input, expected }) => {
  expect(getShiftType(input)).toBe(expected);
});
```

## Complete Testing Reference

This guide covers essential testing patterns. For comprehensive details including:

- MockAppWrapper internals and customization
- Advanced MSW patterns (request verification, dynamic responses)
- Testing complex scenarios (infinite queries, optimistic updates)
- Hook testing patterns
- E2E testing with Playwright

**See your repo's documentation:**
- `src/appV2/redesign/docs/TESTING.md` - Complete testing guide
- `src/appV2/redesign/CLAUDE.md` - Quick testing decision tree
