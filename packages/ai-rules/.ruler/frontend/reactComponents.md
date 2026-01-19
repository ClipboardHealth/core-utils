# React Components

## Type vs Interface

```typescript
// Use interface for: props, object shapes, extensible types
interface UserCardProps {
  user: User;
  onSelect: (id: string) => void;
}
```

## Structure Order

```typescript
export function Component({ userId, onUpdate }: Props) {
  // 1. Hooks
  const { data, isLoading } = useGetUser(userId);
  const [isEditing, setIsEditing] = useState(false);

  // 2. Derived state (no useMemo for cheap operations)
  const displayName = formatName(data);

  // 3. Event handlers
  const handleSave = useCallback(async () => { ... }, [deps]);

  // 4. Early returns for loading/error/empty
  if (isLoading) return <Loading />;
  if (!data) return <NotFound />;

  // 5. Main render
  return <Card>...</Card>;
}
```

## Naming Conventions

- Components: `PascalCase`
- Event handlers: `handle*` (e.g., `handleClick`)
- Props interface: `Props` (co-located) or `ComponentNameProps` (exported)

## Component Guidelines

- **One file per component**—never extract JSX into local variables
- **Composition over configuration**—prefer `children` over many props
- **Presentational components**: stateless, UI-focused, no API calls
- **Container components**: feature logic, data fetching, state management
- Pass primitives as props, not entire API response objects

```typescript
// ❌ Bad—coupled to API shape
interface Props {
  shift: ShiftApiResponse;
}

// ✅ Good—only required fields
interface Props {
  shiftId: string;
  shiftPay: number;
  workplaceId: string;
}
```

## Inline JSX and Handlers

```typescript
// ❌ Don't extract JSX to variables
const content = <p>Content</p>;
return <>{content}</>;

// ✅ Keep inline or extract to new component file
return <p>Content</p>;

// ❌ Don't extract handlers unnecessarily
const handleChange = (e) => { ... };
return <Input onChange={handleChange} />;

// ✅ Keep inline
return <Input onChange={(e) => { ... }} />;
```

## List Rendering

```typescript
// ✅ Always use stable keys
{users.map((user) => <UserCard key={user.id} user={user} />)}

// ❌ Never use index as key for dynamic lists
{items.map((item, i) => <Item key={i} />)}
```
