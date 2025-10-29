# Testing Standards

## Testing Trophy Philosophy

Focus on **Integration tests** - test how components work together as users experience them.

**Investment Priority:**

1. **Static** (TypeScript/ESLint) - Free confidence
2. **Integration** - Most valuable, test features not isolated components
3. **Unit** - For pure helpers/utilities only
4. **E2E** - Critical flows only

**Key Principle:** Test as close to how users interact with your app as possible.

## Technology Stack

- **Vitest** for test runner
- **@testing-library/react** for component testing
- **@testing-library/user-event** for user interactions
- **Mock Service Worker (MSW)** for API mocking

## Test Structure

```typescript
describe("ComponentName", () => {
  it("should render correctly", () => {
    render(<Component />);
    expect(screen.getByText("Expected")).toBeInTheDocument();
  });

  it("should handle user interaction", async () => {
    const user = userEvent.setup();
    render(<Component />);
    await user.click(screen.getByRole("button", { name: "Submit" }));
    await waitFor(() => expect(screen.getByText("Success")).toBeInTheDocument());
  });
});
```

## Test Naming

Pattern: `should [behavior] when [condition]`

## Querying Elements - Priority Order

1. `getByRole` - Best for accessibility
2. `getByLabelText` - For form fields
3. `getByText` - For non-interactive content
4. `getByTestId` - ⚠️ **LAST RESORT**

```typescript
// ✅ Prefer
screen.getByRole("button", { name: /submit/i });
screen.getByLabelText("Email");

// ❌ Avoid
screen.getByClassName("user-card");
screen.getByTestId("element");
```

## User Interactions

```typescript
it("should handle form submission", async () => {
  const user = userEvent.setup();
  const onSubmit = vi.fn();
  render(<Form onSubmit={onSubmit} />);

  await user.type(screen.getByLabelText("Name"), "John");
  await user.click(screen.getByRole("button", { name: "Submit" }));

  expect(onSubmit).toHaveBeenCalledWith({ name: "John" });
});
```

## Hook Testing

```typescript
describe("useCustomHook", () => {
  it("should return data after loading", async () => {
    const { result } = renderHook(() => useCustomHook());
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.data).toEqual(expectedData);
  });
});
```

## MSW Pattern

**Always export factory functions, not static handlers:**

```typescript
// ✅ Good - flexible per test
export const createTestHandler = (data: Data[]) =>
  rest.get(`/api/resource`, (req, res, ctx) => res(ctx.json(data)));

// Usage
mockServer.use(createTestHandler(customData));
```

## Mocking

```typescript
vi.mock("@/lib/api", () => ({
  get: vi.fn().mockResolvedValue({ data: { id: "1" } }),
}));
```

## What to Test

**✅ Do Test:**

- Integration tests for features
- Unit tests for utilities
- All states (loading, success, error)
- User interactions

**❌ Don't Test:**

- Implementation details
- Third-party libraries
- Styles/CSS
