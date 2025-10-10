# Testing Standards

## The Testing Trophy Philosophy

Our testing strategy follows the **Testing Trophy** model:

```
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

## Test File Structure

```typescript
import { render, screen, waitFor } from "@testing-library/react";
import { renderHook } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi, beforeEach } from "vitest";

describe("ComponentName", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("should render correctly", () => {
    render(<Component />);
    expect(screen.getByText("Expected")).toBeInTheDocument();
  });

  it("should handle user interaction", async () => {
    const user = userEvent.setup();
    render(<Component />);

    await user.click(screen.getByRole("button", { name: "Submit" }));

    await waitFor(() => {
      expect(screen.getByText("Success")).toBeInTheDocument();
    });
  });
});
```

## Test Naming Conventions

### Describe Blocks

- Use the component/function name: `describe('ComponentName', ...)`
- Nest describe blocks for complex scenarios

```typescript
describe("ShiftCard", () => {
  describe("when shift is urgent", () => {
    it("should display urgent badge", () => {
      // ...
    });
  });

  describe("when shift is booked", () => {
    it("should show booked status", () => {
      // ...
    });
  });
});
```

### Test Names

- Pattern: `'should [expected behavior] when [condition]'`
- Be descriptive and specific

```typescript
// Good
it("should show loading spinner when data is fetching", () => {});
it("should display error message when API call fails", () => {});
it("should enable submit button when form is valid", () => {});

// Avoid
it("works", () => {});
it("loading state", () => {});
```

## Parameterized Tests

### Using it.each

```typescript
it.each([
  { input: { isUrgent: true }, expected: "URGENT" },
  { input: { isUrgent: false }, expected: "REGULAR" },
])("should return $expected when isUrgent is $input.isUrgent", ({ input, expected }) => {
  expect(getShiftType(input)).toBe(expected);
});
```

### Table-Driven Tests

```typescript
describe("calculateShiftPay", () => {
  it.each([
    { hours: 8, rate: 30, expected: 240 },
    { hours: 10, rate: 25, expected: 250 },
    { hours: 12, rate: 35, expected: 420 },
  ])("should calculate $expected for $hours hours at $rate/hr", ({ hours, rate, expected }) => {
    expect(calculateShiftPay(hours, rate)).toBe(expected);
  });
});
```

## Component Testing (Integration Tests)

Integration tests form the largest part of the Testing Trophy. Test features, not isolated components.

### Rendering Components

```typescript
import { render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

function renderWithProviders(component: ReactElement) {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
    },
  });

  return render(<QueryClientProvider client={queryClient}>{component}</QueryClientProvider>);
}

it("should render user name", () => {
  renderWithProviders(<UserProfile userId="123" />);
  expect(screen.getByText("John Doe")).toBeInTheDocument();
});
```

### Querying Elements - Priority Order

Follow [Testing Library's query priority](https://testing-library.com/docs/queries/about#priority):

1. **`getByRole`** - Best for accessibility (buttons, links, inputs)
2. **`getByLabelText`** - For form fields with labels
3. **`getByPlaceholderText`** - For inputs without labels
4. **`getByText`** - For non-interactive content
5. **`getByDisplayValue`** - For current input values
6. **`getByAltText`** - For images
7. **`getByTitle`** - Less common
8. **`getByTestId`** - ⚠️ **LAST RESORT** - Use only when no other option exists

```typescript
// ✅ Prefer accessible queries
screen.getByRole("button", { name: /submit/i });
screen.getByLabelText("Email address");
screen.getByText("Welcome back");

// ❌ Avoid CSS selectors and implementation details
screen.getByClassName("user-card"); // Users don't see classes
wrapper.find("UserCard").prop("user"); // Testing implementation
screen.getByTestId("custom-element"); // Last resort only
```

### User Interactions

```typescript
import userEvent from "@testing-library/user-event";

it("should handle form submission", async () => {
  const user = userEvent.setup();
  const onSubmit = vi.fn();

  render(<Form onSubmit={onSubmit} />);

  // Type in input
  await user.type(screen.getByLabelText("Name"), "John Doe");

  // Click button
  await user.click(screen.getByRole("button", { name: "Submit" }));

  // Assert
  expect(onSubmit).toHaveBeenCalledWith({ name: "John Doe" });
});
```

## Hook Testing (Unit Tests)

Only write unit tests for hooks that contain business logic, not for UI components.

### Using renderHook

```typescript
import { renderHook, waitFor } from "@testing-library/react";

describe("useCustomHook", () => {
  it("should return loading state initially", () => {
    const { result } = renderHook(() => useCustomHook());

    expect(result.current.isLoading).toBe(true);
  });

  it("should return data after loading", async () => {
    const { result } = renderHook(() => useCustomHook());

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    expect(result.current.data).toEqual(expectedData);
  });
});
```

### Testing Hook Updates

```typescript
it("should update when dependencies change", async () => {
  const { result, rerender } = renderHook(({ userId }) => useGetUser(userId), {
    initialProps: { userId: "1" },
  });

  await waitFor(() => {
    expect(result.current.data?.id).toBe("1");
  });

  // Update props
  rerender({ userId: "2" });

  await waitFor(() => {
    expect(result.current.data?.id).toBe("2");
  });
});
```

## MSW (Mock Service Worker)

### Factory Functions Pattern - IMPORTANT

**Always export factory functions, not static handlers**. This allows tests to customize mock responses.

❌ **Don't** export static handlers (ties tests to single response):

```typescript
// Bad - can only return this one mock
export const facilityNotesSuccessScenario = rest.get(
  `${TEST_API_URL}/facilityNotes`,
  async (_, res, ctx) => res(ctx.status(200), ctx.json(mockFacilityNotes))
);
```

✅ **Do** export factory functions (flexible per test):

```typescript
// Good - each test can provide custom data
export const createFacilityNotesTestHandler = (facilityNotes: FacilityNote[]) => {
  return rest.get<string, Record<string, string>, FacilityNotesResponse>(
    `${TEST_API_URL}/facilityNotes/:facilityId`,
    async (_req, res, ctx) => {
      return res(ctx.status(200), ctx.json(facilityNotes));
    }
  );
};

// Export default success scenario for convenience
export const facilityNotesTestHandlers = [createFacilityNotesTestHandler(mockFacilityNotes)];
```

**Usage in tests:**

```typescript
// In test setup
mockApiServer.use(
  createFacilityNotesTestHandler(myCustomFacilityNotes),
  createExtraTimePaySettingsTestHandler({ payload: customSettings })
);
```

**Rationale:** When endpoints need different responses for different test scenarios, factory functions avoid duplication and inline mocks that become hard to maintain.

## Mocking

### Mocking Modules

```typescript
import { vi } from "vitest";
import * as useDefinedWorkerModule from "@src/appV2/Worker/useDefinedWorker";

// Mock entire module
vi.mock("@src/appV2/Worker/useDefinedWorker");

// Spy on specific function
const useDefinedWorkerSpy = vi.spyOn(useDefinedWorkerModule, "useDefinedWorker");
useDefinedWorkerSpy.mockReturnValue(getMockWorker({ id: "123" }));
```

### Mocking Functions

```typescript
it("should call callback on success", async () => {
  const onSuccess = vi.fn();

  render(<Component onSuccess={onSuccess} />);

  await user.click(screen.getByRole("button"));

  await waitFor(() => {
    expect(onSuccess).toHaveBeenCalledWith(expectedData);
  });
});
```

### Mocking API Calls

```typescript
import { vi } from "vitest";

vi.mock("@src/appV2/lib/api", () => ({
  get: vi.fn().mockResolvedValue({
    data: { id: "1", name: "Test" },
  }),
}));
```

## Async Testing

### Using waitFor

```typescript
it("should display data after loading", async () => {
  render(<AsyncComponent />);

  expect(screen.getByText("Loading...")).toBeInTheDocument();

  await waitFor(() => {
    expect(screen.getByText("Data loaded")).toBeInTheDocument();
  });
});
```

### Using findBy Queries

```typescript
it("should display user name", async () => {
  render(<UserProfile />);

  // findBy automatically waits
  const name = await screen.findByText("John Doe");
  expect(name).toBeInTheDocument();
});
```

## Test Organization

### Co-location

- Place test files next to source files
- Use same name with `.test.ts` or `.test.tsx` extension

```
Feature/
├── Component.tsx
├── Component.test.tsx
├── utils.ts
└── utils.test.ts
```

### Test Helpers

- Create test utilities in `testUtils.ts` or `test-utils.ts`
- Reusable mocks in `mocks/` folder

```typescript
// testUtils.ts
export function getMockShift(overrides = {}): Shift {
  return {
    id: "1",
    title: "Test Shift",
    ...overrides,
  };
}
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

## Coverage Guidelines

- Aim for high coverage on business logic and utilities
- Don't obsess over 100% coverage on UI components
- **Focus on testing behavior**, not implementation
- If you can't query it the way a user would, you're testing wrong

## Common Patterns

### Testing Loading States

```typescript
it("should show loading state", () => {
  render(<Component />);
  expect(screen.getByRole("progressbar")).toBeInTheDocument();
});
```

### Testing Error States

```typescript
it("should display error message on failure", async () => {
  // Mock API error
  vi.mocked(get).mockRejectedValue(new Error("API Error"));

  render(<Component />);

  expect(await screen.findByText("Error loading data")).toBeInTheDocument();
});
```

### Testing Conditional Rendering

```typescript
it("should show premium badge when user is premium", () => {
  render(<UserCard user={{ ...mockUser, isPremium: true }} />);
  expect(screen.getByText("Premium")).toBeInTheDocument();
});

it("should not show premium badge when user is not premium", () => {
  render(<UserCard user={{ ...mockUser, isPremium: false }} />);
  expect(screen.queryByText("Premium")).not.toBeInTheDocument();
});
```
