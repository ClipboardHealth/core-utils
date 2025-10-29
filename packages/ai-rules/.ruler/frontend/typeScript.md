# TypeScript Standards

## Core Principles

- **Strict mode enabled** - Avoid `any`
- **Prefer type inference** - Let TypeScript infer when possible
- **Explicit return types** for exported functions
- **Zod for runtime validation** - Single source of truth
- **No type assertions** unless unavoidable

## Type vs Interface

```typescript
// ✅ Use interface for: props, object shapes, extensible types
interface UserCardProps {
  user: User;
  onSelect: (id: string) => void;
}

interface BaseEntity {
  id: string;
  createdAt: string;
}

interface User extends BaseEntity {
  name: string;
}

// ✅ Use type for: unions, intersections, tuples, derived types
type Status = "pending" | "active" | "completed";
type UserWithRoles = User & { roles: string[] };
type Coordinate = [number, number];
type UserKeys = keyof User;
```

## Naming Conventions

```typescript
// ✅ Suffix with purpose (no I or T prefix)
interface ButtonProps { ... }
type ApiResponse = { ... };
type UserOptions = { ... };

// ✅ Boolean properties
interface User {
  isActive: boolean;
  hasPermission: boolean;
  shouldNotify: boolean;
}
```

## Zod Integration

```typescript
// Define schema, infer type
const userSchema = z.object({
  id: z.string(),
  name: z.string(),
});

export type User = z.infer<typeof userSchema>;

// Validate API responses
const response = await get({
  url: "/api/users",
  responseSchema: userSchema,
});
```

## Type Guards

```typescript
export function isUser(value: unknown): value is User {
  return userSchema.safeParse(value).success;
}

// Usage
if (isUser(data)) {
  console.log(data.name); // TypeScript knows data is User
}
```

## Constants

```typescript
// Use const assertions
export const STATUSES = {
  DRAFT: "draft",
  PUBLISHED: "published",
} as const;

export type Status = (typeof STATUSES)[keyof typeof STATUSES];
```

## Utility Types

```typescript
// Built-in utilities
type PartialUser = Partial<User>;
type RequiredUser = Required<User>;
type ReadonlyUser = Readonly<User>;
type UserIdOnly = Pick<User, "id" | "name">;
type UserWithoutPassword = Omit<User, "password">;
type UserMap = Record<string, User>;
type DefinedString = NonNullable<string | null>;

// Function utilities
type GetUserResult = ReturnType<typeof getUser>;
type UpdateUserParams = Parameters<typeof updateUser>;
```

## Avoiding `any`

```typescript
// ❌ Bad - Loses type safety
function process(data: any) { ... }

// ✅ Use unknown for truly unknown types
function process(data: unknown) {
  if (typeof data === "object" && data !== null) {
    // Type guard
  }
}

// ✅ Better - Use generics
function process<T extends { value: string }>(data: T) {
  return data.value;
}

// ✅ Best - Use Zod
const dataSchema = z.object({ value: z.string() });
function process(data: unknown) {
  const parsed = dataSchema.parse(data);
  return parsed.value;
}
```

## Generics

```typescript
// Generic function
function getFirst<T>(array: T[]): T | undefined {
  return array[0];
}

// Generic component
interface ListProps<T> {
  items: T[];
  renderItem: (item: T) => ReactNode;
}

export function List<T>({ items, renderItem }: ListProps<T>) {
  return <>{items.map((item) => renderItem(item))}</>;
}

// Constrained generics
function findById<T extends { id: string }>(items: T[], id: string): T | undefined {
  return items.find((item) => item.id === id);
}
```

## Discriminated Unions

```typescript
// State machine
type QueryState<T> =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "success"; data: T }
  | { status: "error"; error: Error };

// Automatic type narrowing
if (state.status === "success") {
  console.log(state.data); // TypeScript knows data exists
}

// Actions
type Action = { type: "SET_USER"; payload: User } | { type: "CLEAR_USER" };

function reducer(state: State, action: Action) {
  switch (action.type) {
    case "SET_USER":
      return { ...state, user: action.payload };
    case "CLEAR_USER":
      return { ...state, user: null };
  }
}
```

## Type Narrowing

```typescript
// typeof
function format(value: string | number) {
  if (typeof value === "string") {
    return value.toUpperCase();
  }
  return value.toFixed(2);
}

// in operator
function move(animal: Fish | Bird) {
  if ("swim" in animal) {
    animal.swim();
  } else {
    animal.fly();
  }
}

// instanceof
function handleError(error: unknown) {
  if (error instanceof Error) {
    console.log(error.message);
  }
}
```

## Common Patterns

```typescript
// Optional chaining
const userName = user?.profile?.name;

// Nullish coalescing
const displayName = userName ?? "Anonymous";

// Non-null assertion (use sparingly)
const user = getUser()!;

// Template literal types
type Route = `/users/${string}` | `/posts/${string}`;
type EventHandler = `on${Capitalize<string>}`;
```

## Best Practices

- **Never use `any`** - Use `unknown` or generics
- **Discriminated unions** for state machines
- **Zod** for runtime validation
- **Type guards** over type assertions
- **Const assertions** for readonly values
- **Utility types** to transform existing types
