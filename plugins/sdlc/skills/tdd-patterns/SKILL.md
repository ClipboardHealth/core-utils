---
name: TDD Patterns
description: This skill should be used when the user asks about "test-driven development", "TDD cycle", "Red-Green-Refactor", "write tests first", "failing test", "test coverage", "unit testing patterns", or mentions implementing features using TDD. Provides guidance on test-first development methodology.
version: 0.1.0
---

# TDD Patterns

## Overview

Test-Driven Development (TDD) is a development methodology where tests are written before implementation code. This creates a tight feedback loop that improves code quality, design, and confidence in changes.

## The Red-Green-Refactor Cycle

### Red: Write a Failing Test

1. Identify the next small piece of functionality
2. Write a test that describes the expected behavior
3. Run the test - confirm it fails
4. Verify it fails for the right reason (not syntax errors)

```typescript
// Red: Test for a function that doesn't exist yet
it("returns the sum of two numbers", () => {
  const actual = add(2, 3);

  expect(actual).toBe(5);
});
```

### Green: Write Minimal Implementation

1. Write the simplest code to make the test pass
2. Avoid premature optimization
3. Ignore edge cases (those are separate tests)
4. Run the test - confirm it passes

```typescript
// Green: Simplest implementation
function add(a: number, b: number): number {
  return a + b;
}
```

### Refactor: Improve the Code

1. Improve code structure while keeping tests green
2. Remove duplication
3. Improve naming
4. Extract helpers if needed
5. Run tests after each change

### Commit: Save Progress

After each complete cycle:

1. Stage changes
2. Write descriptive commit message
3. Commit

### Repeat: Next Failing Test

Continue with the next piece of functionality.

## Test Structure

### Arrange-Act-Assert Pattern

```typescript
it("filters active users from list", () => {
  // Arrange
  const input = [
    { id: 1, active: true },
    { id: 2, active: false },
    { id: 3, active: true },
  ];

  // Act
  const actual = filterActiveUsers(input);

  // Assert
  expect(actual).toEqual([
    { id: 1, active: true },
    { id: 3, active: true },
  ]);
});
```

### Naming Conventions

**Variables:**

- `input` - Data being processed
- `expected` - What we expect
- `actual` - What we got
- `mockX` - Mock objects

**Test descriptions:**

- Start with verb describing behavior
- Use present tense
- Be specific about scenario

```typescript
// Good
it("returns empty array when input is empty", () => {});
it("throws ValidationError for negative amounts", () => {});
it("filters out inactive users", () => {});

// Avoid
it("should work correctly", () => {});
it("test case 1", () => {});
```

## Testing Strategies

### Start with Happy Path

Begin with the simplest successful case:

```typescript
// First test: happy path
it("creates a user with valid data", () => {
  const input = { email: "user@example.com", name: "John" };

  const actual = createUser(input);

  expect(actual.id).toBeDefined();
  expect(actual.email).toBe("user@example.com");
});
```

### Add Edge Cases Incrementally

```typescript
// Second test: empty input
it("throws ValidationError when email is missing", () => {
  const input = { name: "John" };

  expect(() => createUser(input)).toThrow(ValidationError);
});

// Third test: invalid format
it("throws ValidationError for invalid email format", () => {
  const input = { email: "invalid", name: "John" };

  expect(() => createUser(input)).toThrow(ValidationError);
});
```

### Use Parameterized Tests

For multiple variations of the same test:

```typescript
it.each([
  [2, 3, 5],
  [0, 0, 0],
  [-1, 1, 0],
  [100, 200, 300],
])("add(%i, %i) returns %i", (a, b, expected) => {
  const actual = add(a, b);

  expect(actual).toBe(expected);
});
```

## Design Benefits

### TDD Improves Design

Writing tests first encourages:

- Small, focused functions
- Clear interfaces
- Dependency injection
- Separation of concerns

### Testability Signals Good Design

If code is hard to test, consider:

- Breaking into smaller functions
- Injecting dependencies
- Separating pure logic from side effects

## Guided TDD Approach

This workflow uses **guided TDD** - encouraging test-first development while allowing flexibility:

### When to Follow Strict TDD

- New feature implementation
- Bug fixes (write failing test first)
- Refactoring (tests must exist first)
- Working on critical paths

### When Flexibility is Acceptable

- Exploratory coding (spike)
- Prototyping interfaces
- Learning new APIs
- Time-critical hotfixes (add tests after)

### Documenting Deviations

When not following TDD, document why:

```typescript
// NOTE: Test added after implementation due to [reason]
// TODO: Consider TDD approach for similar future work
```

## Common Patterns

### Testing Async Code

```typescript
it("fetches user data from API", async () => {
  const mockApi = { getUser: jest.fn().mockResolvedValue({ id: 1 }) };
  const service = new UserService(mockApi);

  const actual = await service.getUser(1);

  expect(actual).toEqual({ id: 1 });
  expect(mockApi.getUser).toHaveBeenCalledWith(1);
});
```

### Testing Error Handling

```typescript
it("returns ServiceError for network failures", async () => {
  const mockApi = { getUser: jest.fn().mockRejectedValue(new Error("Network")) };
  const service = new UserService(mockApi);

  const actual = await service.getUser(1);

  expect(actual.isErr()).toBe(true);
  expect(actual.error.code).toBe("NETWORK_ERROR");
});
```

### Testing with Mocks

```typescript
it("logs successful operations", () => {
  const mockLogger = { info: jest.fn() };
  const service = new OrderService(mockLogger);

  service.createOrder({ item: "book" });

  expect(mockLogger.info).toHaveBeenCalledWith(
    "Order created",
    expect.objectContaining({ item: "book" }),
  );
});
```

## Anti-Patterns to Avoid

### Testing Implementation Details

```typescript
// Bad: tests internal state
it("sets internal flag", () => {
  const service = new Service();
  service.process();
  expect(service._internalFlag).toBe(true); // Don't test privates
});

// Good: tests behavior
it("returns processed result", () => {
  const service = new Service();
  const actual = service.process();
  expect(actual.status).toBe("processed");
});
```

### Overly Complex Test Setup

If setup is complex, the code under test may need refactoring.

### Testing Multiple Things

```typescript
// Bad: multiple assertions testing different behaviors
it("processes and validates and logs", () => {
  // Tests too many things
});

// Good: focused tests
it("processes input correctly", () => {});
it("validates input format", () => {});
it("logs processing result", () => {});
```

## Additional Resources

### Example Files

Working TDD examples in `examples/`:

- **`tddCycleExample.ts`** - Complete Red-Green-Refactor cycle
