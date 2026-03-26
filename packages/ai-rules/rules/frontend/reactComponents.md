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

## Navigation & Layout

- Show bottom navigation on all top-level tabs/pages; hide it on nested or drilled-in views
- Use `Title` with correct heading levels (`h1`-`h6`) and maintain a structured `h1`→`h2`→`h3` hierarchy per page

## Storybook

Register every new or updated shared UI component in Storybook before merging; include a `Default` story first with all relevant props exposed via controls.

## Inline JSX and Handlers

```typescript
// ❌ Don't extract JSX to variables
const content = <p>Content</p>;
return <>{content}</>;

// ✅ Keep inline or extract to new component file
return <p>Content</p>;

// ✅ Simple handlers: keep inline
return <Input onChange={(e) => setValue(e.target.value)} />;

// ✅ Complex handlers with deps or passed to memoized children: extract with useCallback
const handleSave = useCallback(async () => { ... }, [deps]);
return <MemoizedChild onSave={handleSave} />;
```

## Component Reuse

Before creating a new component, search the codebase for existing components that serve the same or similar purpose. Prefer reusing or extending an existing component over creating a new one.

### Search order

1. **Shared UI libraries**: `@clipboard-health/ui-components`, `@clipboard-health/ui-react`, MUI (`@mui/material`)
2. **App-level shared components**: app-level shared directories (e.g., `src/appV2/lib/`, `src/lib/components/`, `src/shared/`)
3. **Sibling features**: similarly-named components in other features (e.g., before creating `ShiftCard`, search for existing `*Card` components)

### Evaluate reuse feasibility

- Can the existing component be used as-is? → use it directly
- Can the existing component be extended with minor prop additions? → modify the existing component
- Is the overlap >70% with only layout/styling differences? → extract a shared base component
- Is the component fundamentally different in behavior? → create a new component (document why reuse was not feasible in the PR description)

### When extending existing components

- Prefer composition (`children`, render props) over adding feature-specific boolean flags
- Do not add more than 2-3 optional props for a single use case — if the component becomes too configurable, it may need to be split
- Ensure the modified component's existing tests still pass and add tests for new behavior

### What to search for

| When creating...  | Search for...                                             |
| ----------------- | --------------------------------------------------------- |
| Card/list item    | `*Card`, `*ListItem`, `*Row` components in other features |
| Modal/dialog      | `*Modal`, `*Dialog`, shared modal patterns in `lib/`      |
| Form/input group  | `*Form`, `*Input`, `*Field` components, form patterns     |
| Empty/error state | `*EmptyState`, `*ErrorState`, `*Placeholder` components   |
| Page layout       | `*Page`, `*Layout`, `*Container` wrapper components       |
