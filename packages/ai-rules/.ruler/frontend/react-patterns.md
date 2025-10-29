# React Component Patterns

## Component Structure

```typescript
interface Props {
  userId: string;
  onUpdate?: (user: User) => void;
}

export function UserProfile({ userId, onUpdate }: Props) {
  // 1. Hooks
  const { data, isLoading } = useGetUser(userId);
  const [isEditing, setIsEditing] = useState(false);

  // 2. Derived state & memoization
  const displayName = useMemo(() => formatName(data), [data]);

  // 3. Event handlers
  const handleSave = useCallback(async () => {
    await saveUser(data);
    onUpdate?.(data);
  }, [data, onUpdate]);

  // 4. Early returns
  if (isLoading) return <Loading />;
  if (!data) return <NotFound />;

  // 5. Main render
  return (
    <Card>
      <Typography>{displayName}</Typography>
      <Button onClick={handleSave}>Save</Button>
    </Card>
  );
}
```

## Naming Conventions

- Components: `PascalCase` (`UserProfile`)
- Props interface: `ComponentNameProps` or `Props`
- Event handlers: `handle*` (`handleClick`, `handleSubmit`)
- Boolean props: `is*`, `has*`, `should*`

## Props Patterns

```typescript
// Simple props
interface Props {
  title: string;
  count: number;
  onAction: () => void;
}

// Discriminated unions for variants
type ButtonProps = { variant: "link"; href: string } | { variant: "button"; onClick: () => void };

// Optional callbacks
interface Props {
  onSuccess?: (data: Data) => void;
  onError?: (error: Error) => void;
}
```

## Composition Patterns

```typescript
// Container/Presentational
export function UserListContainer() {
  const { data } = useUsers();
  return <UserList users={data} />;
}

// Compound components
<Card>
  <Card.Header title="User" />
  <Card.Body>Content</Card.Body>
  <Card.Actions>
    <Button>Save</Button>
  </Card.Actions>
</Card>

// Render props
<DataProvider>
  {({ data, isLoading }) => (
    isLoading ? <Loading /> : <Display data={data} />
  )}
</DataProvider>
```

## Children Patterns

```typescript
// Typed children
interface Props {
  children: ReactNode;
}

// Render prop pattern
interface Props {
  children: (data: Data) => ReactNode;
}

// Element restrictions
interface Props {
  children: ReactElement<ButtonProps>;
}
```

## List Rendering

```typescript
// ✅ Proper keys
{users.map((user) => <UserCard key={user.id} user={user} />)}

// ✅ Empty states
{users.length === 0 ? <EmptyState /> : users.map(...)}

// ❌ Never use index as key when list can change
{items.map((item, index) => <Item key={index} />)} // Wrong!
```

## Conditional Rendering

```typescript
// Simple conditional
{isLoading && <Spinner />}

// If-else
{isError ? <Error /> : <Success />}

// Multiple conditions
{isLoading ? <Loading /> : isError ? <Error /> : <Data />}

// With early returns (preferred for complex logic)
if (isLoading) return <Loading />;
if (isError) return <Error />;
return <Data />;
```

## Performance

```typescript
// Memoize expensive components
const MemoItem = memo(({ item }: Props) => <div>{item.name}</div>);

// Split state to avoid re-renders
function Parent() {
  const [count, setCount] = useState(0);
  const [text, setText] = useState("");

  // Only CountDisplay re-renders when count changes
  return (
    <>
      <CountDisplay count={count} />
      <TextInput value={text} onChange={setText} />
    </>
  );
}
```

## Best Practices

- **Single Responsibility** - One component, one purpose
- **Composition over Props** - Use children and compound components
- **Colocate State** - Keep state close to where it's used
- **Type Everything** - Full TypeScript coverage
- **Test Behavior** - Test user interactions, not implementation
