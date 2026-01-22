# Architecture Patterns

## Container/View Pattern

**Principle:** Strict separation of data fetching (Container) from presentation (View).

### Why This Pattern?

- **Testability:** View is pure function of props (easy to test)
- **Reusability:** Views can be reused with different data sources
- **Clarity:** Clear responsibilities prevent "god components"
- **Maintainability:** Changes to data fetching don't affect UI logic

### Container Responsibilities

**What Containers DO:**
- Fetch data using React Query hooks
- Manage local state (modals, pagination, filters)
- Define event handlers
- Pass **primitives** to View (strings, numbers, booleans, callbacks)

**What Containers DON'T DO:**
- Render complex UI (delegate to View)
- Contain business logic (extract to utils)
- Handle loading/error states (View handles these)

### View Responsibilities

**What Views DO:**
- Render UI based on props
- Handle loading/error/empty states
- Use shared components
- Apply styling with theme tokens

**What Views DON'T DO:**
- Fetch data or make API calls
- Manage state (except trivial UI state like hover)
- Contain event handler logic (receive as props)

### Example: Complete Pattern

**Container** (`ResourceContainer.tsx`):
```typescript
export function ResourceContainer() {
  // 1. Fetch data
  const { data, isLoading, isError } = useGetResources();

  // 2. Manage state
  const [page, setPage] = useState(1);
  const modalState = useModalState();

  // 3. Event handlers
  const handlePageChange = useCallback((newPage: number) => {
    setPage(newPage);
  }, []);

  const handleCreate = useCallback(() => {
    modalState.openModal();
  }, [modalState]);

  // 4. Pass primitives to View
  return (
    <ResourceView
      resources={data}
      isLoading={isLoading}
      hasError={isError}
      page={page}
      onPageChange={handlePageChange}
      onCreateClick={handleCreate}
    />
  );
}
```

**View** (`ResourceView.tsx`):
```typescript
interface ResourceViewProps {
  resources: Resource[] | undefined;
  isLoading: boolean;
  hasError: boolean;
  page: number;
  onPageChange: (page: number) => void;
  onCreateClick: () => void;
}

export function ResourceView({
  resources,
  isLoading,
  hasError,
  page,
  onPageChange,
  onCreateClick,
}: ResourceViewProps) {
  // Handle states
  if (isLoading) return <LoadingState />;
  if (hasError) return <ErrorState />;
  if (!resources?.length) return <EmptyState onCreateClick={onCreateClick} />;

  // Render main UI
  return (
    <Box sx={(theme) => ({ padding: theme.spacing(5) })}>
      <Stack spacing={3}>
        <Box sx={{ display: "flex", justifyContent: "space-between" }}>
          <Title variant="h1">Resources</Title>
          <Button variant="primary" onClick={onCreateClick}>
            Create New
          </Button>
        </Box>

        <ResourceList resources={resources} />

        <Pagination page={page} onChange={onPageChange} />
      </Stack>
    </Box>
  );
}
```

**Page** (`ResourcePage.tsx`):
```typescript
export function ResourcePage() {
  return (
    <ThemeProvider>
      <ResourceContainer />
    </ThemeProvider>
  );
}
```

## Feature Folder Structure

### Standard Structure

```
FeatureName/
├── api/                           # Data fetching hooks
│   ├── useGetResource.ts
│   ├── useGetResource.test.ts
│   ├── useCreateResource.ts
│   ├── useUpdateResource.ts
│   └── testUtils/
│       └── handlers.ts            # MSW handler factories
│
├── components/                    # Feature-specific components
│   ├── ResourceCard.tsx
│   ├── ResourceModal.tsx
│   └── ResourceForm.tsx
│
├── hooks/                         # Non-API hooks
│   └── useResourceFilters.ts
│
├── utils/                         # Pure utilities
│   ├── formatResource.ts
│   └── formatResource.test.ts
│
├── FeatureContainer.tsx           # Container (data + state)
├── FeatureView.tsx                # View (presentation)
├── FeaturePage.tsx                # Page (routing entry point)
├── types.ts                       # Shared types
├── constants.ts                   # Constants
└── paths.ts                       # Route paths
```

### When to Create What

**Create a new feature folder when:**
- Building a new user-facing feature
- Feature has multiple related components
- Feature needs dedicated API hooks

**Use existing folders when:**
- Adding to existing feature
- Creating shared utility
- Building reusable component

**Extract to shared when:**
- Component used in 3+ features
- Utility used across features
- Hook applies to multiple features

## Component Patterns

### Props: Pass Primitives, Not Objects

**❌ Don't pass entire API response:**
```typescript
interface Props {
  shift: ShiftApiResponse;  // Couples to API shape
}

function ShiftCard({ shift }: Props) {
  return <Text>{shift.workplace.name}</Text>;
}
```

**✅ Pass only what's needed:**
```typescript
interface Props {
  shiftId: string;
  workplaceName: string;
  startTime: Date;
  payAmount: number;
}

function ShiftCard({ shiftId, workplaceName, startTime, payAmount }: Props) {
  return <Text>{workplaceName}</Text>;
}
```

**Why?** Views become reusable, testable, and decoupled from API changes.

### One File Per Component

**❌ Don't extract JSX to variables:**
```typescript
function Component() {
  const header = <Header title="Title" />;
  const content = <p>Content</p>;

  return <>{header}{content}</>;
}
```

**✅ Keep inline or extract to new file:**
```typescript
// Inline for simple cases
function Component() {
  return (
    <>
      <Header title="Title" />
      <p>Content</p>
    </>
  );
}

// Or extract to ComponentHeader.tsx for complexity
```

### Component Naming

- **Containers:** `FeatureContainer.tsx`
- **Views:** `FeatureView.tsx`
- **Pages:** `FeaturePage.tsx`
- **Feature components:** `FeatureCard.tsx`, `FeatureModal.tsx`
- **Shared components:** `Button.tsx`, `Card.tsx`

## Common Mistakes

### ❌ Mixing Data and Presentation

```typescript
// Bad - Container does too much rendering
function ResourceContainer() {
  const { data } = useGetResources();

  return (
    <Box sx={{ padding: 5 }}>
      <Title>Resources</Title>
      {data?.map((resource) => (
        <Card key={resource.id}>
          <Text>{resource.name}</Text>
        </Card>
      ))}
    </Box>
  );
}
```

**✅ Separate concerns:**
```typescript
// Good - Container handles data, View handles UI
function ResourceContainer() {
  const { data, isLoading } = useGetResources();
  return <ResourceView resources={data} isLoading={isLoading} />;
}

function ResourceView({ resources, isLoading }: Props) {
  if (isLoading) return <Loading />;
  return (
    <Box sx={{ padding: 5 }}>
      {/* Rendering logic here */}
    </Box>
  );
}
```

### ❌ View Making API Calls

```typescript
// Bad - View should be pure
function ResourceView() {
  const { data } = useGetResources();  // ❌ API call in View
  return <ResourceList resources={data} />;
}
```

**✅ Container makes API calls:**
```typescript
// Good - Container fetches, View displays
function ResourceContainer() {
  const { data } = useGetResources();  // ✅ API call in Container
  return <ResourceView resources={data} />;
}
```

### ❌ Passing Entire Objects

```typescript
// Bad - View coupled to API response shape
<ResourceView resource={apiResponse} />
```

**✅ Pass primitives:**
```typescript
// Good - View only knows what it needs
<ResourceView
  resourceId={apiResponse.id}
  name={apiResponse.name}
  status={apiResponse.status}
/>
```

## Best Practices

1. **Keep Containers thin** - Delegate complex logic to hooks/utils
2. **Keep Views pure** - Function of props only
3. **Use TypeScript strictly** - Explicit prop interfaces
4. **Co-locate tests** - Test file next to source file
5. **Extract early** - Move to shared/ when used 3+ times
6. **Composition over props** - Use `children` when possible

## Reference

For complete examples from your codebase, see:
- Your repo's `src/appV2/redesign/CLAUDE.md`
- Example feature folders in your repo
