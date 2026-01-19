# TypeScript

## Naming Conventions

| Element               | Convention            | Example                      |
| --------------------- | --------------------- | ---------------------------- |
| File-scope constants  | UPPER_SNAKE_CASE      | `MAX_RETRY_COUNT`            |
| Acronyms in camelCase | Lowercase after first | `httpRequest`, `gpsPosition` |
| Files                 | Singular, dotted      | `user.service.ts`            |

## Core Rules

- Strict-mode TypeScript; prefer interfaces over types
- Avoid enums—use const maps
- NEVER use `any`—use `unknown` or generics
- Avoid type assertions (`as`, `!`) unless absolutely necessary
- Use `function` keyword for declarations, not `const`
- Prefer `undefined` over `null`
- Explicit return types on functions
- Files read top-to-bottom: exports first, internal helpers below
- Boolean props: `is*`, `has*`, `should*`, `can*`
- Use const assertions for constants: `as const`

## Types

```typescript
// Strong typing
function process(arg: unknown) {} // Better than any
function process<T>(arg: T) {} // Best

// Nullable checks
if (foo == null) {
} // Clear intent
if (isDefined(foo)) {
} // Better with utility

// Quantity values—always unambiguous
const money = { amountInMinorUnits: 500, currencyCode: "USD" };
const durationMinutes = 30;
```

**Type Techniques:**

- Union, intersection, conditional types for complex definitions
- Mapped types: `Partial<T>`, `Pick<T>`, `Omit<T>`
- `keyof`, index access types, discriminated unions
- `as const`, `typeof`, `instanceof`, `satisfies`, type guards
- Exhaustiveness checking with `never`
- `readonly` for parameter immutability

## Functions

```typescript
// Object arguments with interfaces
interface CreateUserRequest {
  email: string;
  name?: string;
}

function createUser(request: CreateUserRequest): User {
  const { email, name } = request; // Destructure inside
  // ...
}

// Guard clauses for early returns
function processOrder(order: Order): Result {
  if (!order.isValid) {
    return { error: "Invalid order" };
  }
  // Main logic
}
```

## Objects & Arrays

```typescript
// Spread over Object.assign
const updated = { ...original, name: "New Name" };

// Array methods over loops (unless breaking early)
const doubled = items.map((item) => item * 2);
const sorted = items.toSorted((a, b) => a - b); // Immutable

// For early exit
for (const item of items) {
  if (condition) break;
}
```

## Async

```typescript
// async/await over .then()
async function fetchData(): Promise<Data> {
  const response = await api.get("/data");
  return response.data;
}

// Parallel
const results = await Promise.all(items.map(processItem));

// Sequential (when needed)
for (const item of items) {
  // eslint-disable-next-line no-await-in-loop
  await processItem(item);
}
```

## Classes

```typescript
class UserService {
  public async findById(request: FindByIdRequest): Promise<User> {}
  private validateUser(user: User): boolean {}
}

// Extract pure functions outside classes
function formatUserName(first: string, last: string): string {
  return `${first} ${last}`;
}
```
