# TypeScript Standards

## Core Principles

- **Strict mode enabled** - no `any` unless absolutely necessary (document why)
- **Prefer type inference** - let TypeScript infer when possible
- **Explicit return types** for exported functions
- **Zod for runtime validation** - single source of truth for types and validation
- **No type assertions** unless unavoidable (prefer type guards)

## Type vs Interface

Use the right tool for the job:

### Use `interface` for:

- **Component props**
- **Object shapes**
- **Class definitions**
- **Anything that might be extended**

```typescript
// ✅ Good - Interface for props
interface UserCardProps {
  user: User;
  onSelect: (id: string) => void;
  isHighlighted?: boolean;
}

// ✅ Good - Interface can be extended
interface BaseEntity {
  id: string;
  createdAt: string;
}

interface User extends BaseEntity {
  name: string;
  email: string;
}
```

### Use `type` for:

- **Unions**
- **Intersections**
- **Tuples**
- **Derived/conditional types**
- **Type aliases**

```typescript
// ✅ Good - Type for unions
type Status = "pending" | "active" | "completed" | "failed";

// ✅ Good - Type for intersections
type UserWithPermissions = User & { permissions: string[] };

// ✅ Good - Type for tuples
type Coordinate = [number, number];

// ✅ Good - Derived types
type UserKeys = keyof User;
type PartialUser = Partial<User>;
```

## Naming Conventions

### Types and Interfaces

- **Suffix with purpose**: `Props`, `Response`, `Request`, `Options`, `Params`, `State`
- **No `I` or `T` prefix** (we're not in C# or Java)
- **PascalCase** for type names

```typescript
// ✅ Good
interface ButtonProps { ... }
type ApiResponse = { ... };
type UserOptions = { ... };

// ❌ Bad
interface IButton { ... }  // No I prefix
type TResponse = { ... };   // No T prefix
interface buttonprops { ... }  // Wrong case
```

### Boolean Properties

Always prefix with `is`, `has`, `should`, `can`, `will`:

```typescript
// ✅ Good
interface User {
  isActive: boolean;
  hasPermission: boolean;
  shouldNotify: boolean;
  canEdit: boolean;
  willExpire: boolean;
}

// ❌ Bad
interface User {
  active: boolean; // Unclear
  permission: boolean; // Unclear
  notify: boolean; // Unclear
}
```

## Zod Integration

```typescript
// Define schema first
const userSchema = z.object({
  id: z.string(),
  name: z.string(),
});

// Infer type from schema
export type User = z.infer<typeof userSchema>;

// Use for API validation
const response = await get({
  url: "/api/users",
  responseSchema: userSchema,
});
```

## Type Guards

```typescript
export function isEventKey(key: string): key is EventKey {
  return VALID_EVENT_KEYS.includes(key as EventKey);
}
```

## Constants

```typescript
// Use const assertions for readonly values
export const STAGES = {
  DRAFT: "draft",
  PUBLISHED: "published",
} as const;

export type Stage = (typeof STAGES)[keyof typeof STAGES];
```

## Function Types

```typescript
// Explicit return types for exported functions
export function calculateTotal(items: Item[]): number {
  return items.reduce((sum, item) => sum + item.price, 0);
}

// Prefer interfaces for function props
interface HandleSubmitProps {
  userId: string;
  data: FormData;
}

export function handleSubmit(props: HandleSubmitProps): Promise<void> {
  // ...
}
```

## Utility Types

TypeScript provides powerful built-in utility types. Use them:

```typescript
// Partial - Make all properties optional
type PartialUser = Partial<User>;

// Required - Make all properties required
type RequiredUser = Required<User>;

// Readonly - Make all properties readonly
type ReadonlyUser = Readonly<User>;

// Pick - Select specific properties
type UserIdOnly = Pick<User, "id" | "name">;

// Omit - Remove specific properties
type UserWithoutPassword = Omit<User, "password">;

// Record - Create object type with specific key/value types
type UserMap = Record<string, User>;

// NonNullable - Remove null and undefined
type DefinedString = NonNullable<string | null | undefined>; // string

// ReturnType - Extract return type from function
function getUser() { return { id: '1', name: 'John' }; }
type User = ReturnType<typeof getUser>;

// Parameters - Extract parameter types from function
function updateUser(id: string, data: UserData) { ... }
type UpdateUserParams = Parameters<typeof updateUser>; // [string, UserData]
```

## Avoiding `any`

The `any` type defeats the purpose of TypeScript. Use alternatives:

```typescript
// ❌ Bad - Loses all type safety
function process(data: any) {
  return data.value; // No error if value doesn't exist!
}

// ✅ Good - Use unknown for truly unknown types
function process(data: unknown) {
  if (typeof data === "object" && data !== null && "value" in data) {
    return (data as { value: string }).value;
  }
  throw new Error("Invalid data");
}

// ✅ Better - Use generics
function process<T extends { value: string }>(data: T) {
  return data.value; // Type safe!
}

// ✅ Best - Use Zod for runtime validation
const dataSchema = z.object({ value: z.string() });
function process(data: unknown) {
  const parsed = dataSchema.parse(data); // Throws if invalid
  return parsed.value; // Type safe!
}
```

## Generics

Use generics for reusable, type-safe code:

```typescript
// ✅ Good - Generic function
function getFirst<T>(array: T[]): T | undefined {
  return array[0];
}

const firstNumber = getFirst([1, 2, 3]); // number | undefined
const firstName = getFirst(["a", "b"]); // string | undefined

// ✅ Good - Generic component
interface ListProps<T> {
  items: T[];
  renderItem: (item: T) => ReactNode;
  keyExtractor: (item: T) => string;
}

export function List<T>({ items, renderItem, keyExtractor }: ListProps<T>) {
  return (
    <Box>
      {items.map((item) => (
        <Box key={keyExtractor(item)}>{renderItem(item)}</Box>
      ))}
    </Box>
  );
}

// Usage - Type inferred!
<List
  items={users}
  renderItem={(user) => <UserCard user={user} />} // user is User
  keyExtractor={(user) => user.id}
/>;

// ✅ Good - Constrained generics
interface HasId {
  id: string;
}

function findById<T extends HasId>(items: T[], id: string): T | undefined {
  return items.find((item) => item.id === id);
}
```

## Type Guards

Use type guards for runtime type checking:

```typescript
// ✅ Good - Type predicate
export function isUser(value: unknown): value is User {
  return (
    typeof value === "object" &&
    value !== null &&
    "id" in value &&
    "name" in value &&
    typeof value.id === "string" &&
    typeof value.name === "string"
  );
}

// Usage
function processData(data: unknown) {
  if (isUser(data)) {
    console.log(data.name); // TypeScript knows data is User
  }
}

// ✅ Better - Use Zod (runtime validation + type guard)
const userSchema = z.object({
  id: z.string(),
  name: z.string(),
});

export function isUser(value: unknown): value is User {
  return userSchema.safeParse(value).success;
}

// ✅ Good - Discriminated unions
type ApiResponse =
  | { status: "success"; data: User }
  | { status: "error"; error: string }
  | { status: "loading" };

function handleResponse(response: ApiResponse) {
  switch (response.status) {
    case "success":
      console.log(response.data); // TypeScript knows data exists
      break;
    case "error":
      console.log(response.error); // TypeScript knows error exists
      break;
    case "loading":
      // TypeScript knows no data or error exists
      break;
  }
}
```

## Const Assertions

Use `as const` for readonly literal types:

```typescript
// ✅ Good - Const assertion for object
export const STATUSES = {
  PENDING: "pending",
  ACTIVE: "active",
  COMPLETED: "completed",
} as const;

// Type: 'pending' | 'active' | 'completed'
export type Status = (typeof STATUSES)[keyof typeof STATUSES];

// ✅ Good - Const assertion for array
export const COLORS = ["red", "blue", "green"] as const;
export type Color = (typeof COLORS)[number]; // 'red' | 'blue' | 'green'

// ❌ Bad - Without const assertion
export const STATUSES = {
  PENDING: "pending", // Type: string (too loose!)
  ACTIVE: "active",
};
```

## Discriminated Unions

Use for state machines and API responses:

```typescript
// ✅ Good - Discriminated union for query state
type QueryState<T> =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "success"; data: T }
  | { status: "error"; error: Error };

function useQueryState<T>(): QueryState<T> {
  // ...
}

// Usage - Type narrowing works automatically
const state = useQueryState<User>();

if (state.status === "success") {
  console.log(state.data); // TypeScript knows data exists
}

// ✅ Good - Discriminated union for actions
type Action =
  | { type: "SET_USER"; payload: User }
  | { type: "CLEAR_USER" }
  | { type: "UPDATE_USER"; payload: Partial<User> };

function reducer(state: State, action: Action) {
  switch (action.type) {
    case "SET_USER":
      return { ...state, user: action.payload }; // payload is User
    case "CLEAR_USER":
      return { ...state, user: null }; // no payload
    case "UPDATE_USER":
      return { ...state, user: { ...state.user, ...action.payload } };
  }
}
```

## Function Overloads

Use for functions with different parameter/return combinations:

```typescript
// ✅ Good - Function overloads
function formatValue(value: string): string;
function formatValue(value: number): string;
function formatValue(value: Date): string;
function formatValue(value: string | number | Date): string {
  if (typeof value === "string") return value;
  if (typeof value === "number") return value.toString();
  return value.toISOString();
}

// TypeScript knows the return type based on input
const str1 = formatValue("hello"); // string
const str2 = formatValue(123); // string
const str3 = formatValue(new Date()); // string
```

## Template Literal Types

Use for type-safe string patterns:

```typescript
// ✅ Good - Event names
type EventName = `on${Capitalize<string>}`;

interface Props {
  onClick: () => void; // Valid
  onHover: () => void; // Valid
  // click: () => void; // Error: doesn't match pattern
}

// ✅ Good - Route paths
type Route = `/users/${string}` | `/posts/${string}` | "/";

const validRoute: Route = "/users/123"; // ✅
const invalidRoute: Route = "users/123"; // ❌ Error

// ✅ Good - CSS properties
type CSSProperty = `${"margin" | "padding"}${"Top" | "Bottom" | "Left" | "Right"}`;
// 'marginTop' | 'marginBottom' | 'marginLeft' | 'marginRight' | 'paddingTop' | ...
```

## Mapped Types

Create new types by transforming existing ones:

```typescript
// ✅ Good - Make all properties optional
type Optional<T> = {
  [K in keyof T]?: T[K];
};

// ✅ Good - Make all properties readonly
type Immutable<T> = {
  readonly [K in keyof T]: T[K];
};

// ✅ Good - Add suffix to all keys
type Prefixed<T, P extends string> = {
  [K in keyof T as `${P}${Capitalize<string & K>}`]: T[K];
};

type User = { name: string; age: number };
type PrefixedUser = Prefixed<User, "user">;
// { userName: string; userAge: number }
```

## Type Narrowing

Let TypeScript narrow types automatically:

```typescript
// ✅ Good - Typeof narrowing
function format(value: string | number) {
  if (typeof value === "string") {
    return value.toUpperCase(); // TypeScript knows value is string
  }
  return value.toFixed(2); // TypeScript knows value is number
}

// ✅ Good - Truthiness narrowing
function getLength(value: string | null) {
  if (value) {
    return value.length; // TypeScript knows value is string
  }
  return 0;
}

// ✅ Good - In narrowing
interface Fish {
  swim: () => void;
}
interface Bird {
  fly: () => void;
}

function move(animal: Fish | Bird) {
  if ("swim" in animal) {
    animal.swim(); // TypeScript knows animal is Fish
  } else {
    animal.fly(); // TypeScript knows animal is Bird
  }
}

// ✅ Good - Instanceof narrowing
function handleError(error: unknown) {
  if (error instanceof Error) {
    console.log(error.message); // TypeScript knows error is Error
  }
}
```

## Common Patterns

### Optional Chaining & Nullish Coalescing

```typescript
// ✅ Good - Optional chaining
const userName = user?.profile?.name;

// ✅ Good - Nullish coalescing (only null/undefined, not '')
const displayName = userName ?? "Anonymous";

// ❌ Bad - Logical OR (treats '' and 0 as falsy)
const displayName = userName || "Anonymous";
```

### Non-null Assertion (Use Sparingly)

```typescript
// ⚠️ Use sparingly - Only when you're 100% sure
const user = getUser()!; // Tells TS: trust me, it's not null

// ✅ Better - Handle null case
const user = getUser();
if (!user) throw new Error("User not found");
// Now TypeScript knows user exists
```

## Related Rules

- **Zod Integration**: See `.agents/rules/data-fetching.md` for API validation patterns
- **React Patterns**: See `.agents/rules/react-patterns.md` for component prop types
- **Testing**: See `.agents/rules/testing.md` for test type patterns
