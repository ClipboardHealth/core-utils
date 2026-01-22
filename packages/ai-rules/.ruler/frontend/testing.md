# Testing

## Philosophy

Focus on integration tests—test how components work together as users experience them.

**Priority:** Static (TS/ESLint) → Integration → Unit (pure utilities only) → E2E (critical flows only)

## Test Structure

```typescript
describe("ComponentName", () => {
  it("should [behavior] when [condition]", async () => {
    const user = userEvent.setup();
    render(<Component />);

    await user.click(screen.getByRole("button", { name: "Submit" }));

    await waitFor(() => {
      expect(screen.getByText("Success")).toBeInTheDocument();
    });
  });
});
```

## Query Priority

1. `getByRole` (best for accessibility)
2. `getByLabelText` (form fields)
3. `getByText` (non-interactive content)
4. `getByTestId` (last resort only)

```typescript
// ✅ Prefer
screen.getByRole("button", { name: /submit/i });
screen.getByLabelText("Email");

// ❌ Avoid
screen.getByTestId("submit-button");
```

## MSW Handlers

Export factory functions, not static handlers:

```typescript
// ✅ Good—flexible per test
export const createUserHandler = (userData: User) =>
  rest.get("/api/user", (req, res, ctx) => res(ctx.json(userData)));

// Usage
mockServer.use(createUserHandler(customData));
```

## What to Test

✅ Test: user interactions, all states (loading/success/error), integration between components
❌ Don't test: implementation details, third-party libraries, styles
