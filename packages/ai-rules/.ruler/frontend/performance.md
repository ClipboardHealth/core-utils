# Performance Standards

## React Query Optimization

### Stale Time Configuration

```typescript
// Set appropriate staleTime to avoid unnecessary refetch
useGetQuery({
  url: "/api/resource",
  responseSchema: schema,
  staleTime: minutesToMilliseconds(5), // Don't refetch for 5 minutes
  cacheTime: minutesToMilliseconds(30), // Keep in cache for 30 minutes
});
```

### Conditional Fetching

```typescript
// Only fetch when conditions are met
const { data } = useGetQuery({
  url: `/api/users/${userId}`,
  responseSchema: userSchema,
  enabled: isDefined(userId) && isFeatureEnabled, // Don't fetch until ready
});
```

### Query Cancellation

```typescript
export function usePaginatedData(params: Params) {
  const queryClient = useQueryClient();

  return useInfiniteQuery({
    queryKey: ["data", params],
    queryFn: async ({ pageParam }) => {
      // Cancel previous in-flight requests
      await queryClient.cancelQueries({ queryKey: ["data"] });

      const response = await get({
        url: "/api/data",
        queryParams: { cursor: pageParam, ...params },
      });
      return response.data;
    },
    getNextPageParam: (lastPage) => lastPage.nextCursor,
  });
}
```

### Prefetching

```typescript
export function usePreloadNextPage(nextUserId: string) {
  const queryClient = useQueryClient();

  useEffect(() => {
    if (nextUserId) {
      // Prefetch next page in background
      queryClient.prefetchQuery({
        queryKey: ["user", nextUserId],
        queryFn: () => fetchUser(nextUserId),
        staleTime: minutesToMilliseconds(5),
      });
    }
  }, [nextUserId, queryClient]);
}
```

## React Optimization

### useMemo for Expensive Computations

```typescript
export function DataList({ items }: { items: Item[] }) {
  // Memoize expensive sorting/filtering
  const sortedItems = useMemo(() => {
    return items.filter((item) => item.isActive).sort((a, b) => a.priority - b.priority);
  }, [items]);

  return <List items={sortedItems} />;
}
```

### useCallback for Event Handlers

```typescript
export function ParentComponent() {
  const [selected, setSelected] = useState<string>();

  // Memoize callback to prevent child re-renders
  const handleSelect = useCallback((id: string) => {
    setSelected(id);
    logEvent("ITEM_SELECTED", { id });
  }, []); // Stable reference

  return <ChildComponent onSelect={handleSelect} />;
}
```

### React.memo for Pure Components

```typescript
import { memo } from "react";

interface ItemCardProps {
  item: Item;
  onSelect: (id: string) => void;
}

// Memoize component to prevent unnecessary re-renders
export const ItemCard = memo(function ItemCard({ item, onSelect }: ItemCardProps) {
  return (
    <Card onClick={() => onSelect(item.id)}>
      <h3>{item.name}</h3>
    </Card>
  );
});
```

### Avoid Inline Object/Array Creation

```typescript
// ❌ Creates new object on every render
<Component style={{ padding: 8 }} />
<Component items={[1, 2, 3]} />

// ✅ Define outside or use useMemo
const style = { padding: 8 };
const items = [1, 2, 3];
<Component style={style} items={items} />

// ✅ Or use useMemo for dynamic values
const style = useMemo(() => ({ padding: spacing }), [spacing]);
```

## List Rendering

### Key Prop for Lists

```typescript
// ✅ Use stable, unique keys
items.map((item) => <ItemCard key={item.id} item={item} />);

// ❌ Don't use index as key (unless list never changes)
items.map((item, index) => <ItemCard key={index} item={item} />);
```

### Virtualization for Long Lists

```typescript
import { FixedSizeList } from "react-window";

export function VirtualizedList({ items }: { items: Item[] }) {
  return (
    <FixedSizeList height={600} itemCount={items.length} itemSize={80} width="100%">
      {({ index, style }) => (
        <div style={style}>
          <ItemCard item={items[index]} />
        </div>
      )}
    </FixedSizeList>
  );
}
```

### Pagination Instead of Infinite Data

```typescript
// For large datasets, use pagination
export function PaginatedList() {
  const [page, setPage] = useState(1);
  const pageSize = 20;

  const { data, isLoading } = useGetPaginatedData({
    page,
    pageSize,
  });

  return (
    <>
      <List items={data?.items} />
      <Pagination page={page} total={data?.total} pageSize={pageSize} onChange={setPage} />
    </>
  );
}
```

## Data Fetching Patterns

### Parallel Queries

```typescript
export function useParallelData() {
  // Fetch in parallel
  const users = useGetUsers();
  const shifts = useGetShifts();
  const workplaces = useGetWorkplaces();

  // All queries run simultaneously
  const isLoading = users.isLoading || shifts.isLoading || workplaces.isLoading;

  return {
    users: users.data,
    shifts: shifts.data,
    workplaces: workplaces.data,
    isLoading,
  };
}
```

### Dependent Queries

```typescript
export function useDependentData(userId?: string) {
  // First query
  const { data: user } = useGetUser(userId, {
    enabled: isDefined(userId),
  });

  // Second query depends on first
  const { data: shifts } = useGetUserShifts(user?.id, {
    enabled: isDefined(user?.id), // Only fetch when user is loaded
  });

  return { user, shifts };
}
```

### Debouncing Search Queries

```typescript
import { useDebouncedValue } from "@/lib/hooks";

export function SearchComponent() {
  const [searchTerm, setSearchTerm] = useState("");
  const debouncedSearch = useDebouncedValue(searchTerm, 300);

  const { data } = useSearchQuery(debouncedSearch, {
    enabled: debouncedSearch.length > 2,
  });

  return (
    <>
      <input value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} />
      <Results data={data} />
    </>
  );
}
```

## Code Splitting

### Route-Based Splitting

```typescript
import { lazy, Suspense } from "react";

// Lazy load route components
const ShiftDetailsPage = lazy(() => import("./Shift/DetailsPage"));
const ProfilePage = lazy(() => import("./Profile/Page"));

export function Router() {
  return (
    <Suspense fallback={<LoadingScreen />}>
      <Routes>
        <Route path="/shifts/:id" element={<ShiftDetailsPage />} />
        <Route path="/profile" element={<ProfilePage />} />
      </Routes>
    </Suspense>
  );
}
```

### Component-Based Splitting

```typescript
// Split large components that aren't immediately needed
const HeavyChart = lazy(() => import("./HeavyChart"));

export function Dashboard() {
  const [showChart, setShowChart] = useState(false);

  return (
    <div>
      <Summary />
      {showChart && (
        <Suspense fallback={<ChartSkeleton />}>
          <HeavyChart />
        </Suspense>
      )}
    </div>
  );
}
```

## Image Optimization

### Lazy Loading Images

```typescript
<img
  src={imageUrl}
  alt={alt}
  loading="lazy" // Native lazy loading
/>
```

### Responsive Images

```typescript
<img
  srcSet={`
    ${image_small} 480w,
    ${image_medium} 800w,
    ${image_large} 1200w
  `}
  sizes="(max-width: 480px) 480px, (max-width: 800px) 800px, 1200px"
  src={image_medium}
  alt={alt}
/>
```

## State Management

### Avoid Prop Drilling

```typescript
// ❌ Prop drilling
<Parent>
  <Child data={data}>
    <GrandChild data={data}>
      <GreatGrandChild data={data} />
    </GrandChild>
  </Child>
</Parent>;

// ✅ Use context for deeply nested data
const DataContext = createContext<Data | undefined>(undefined);

<DataContext.Provider value={data}>
  <Parent>
    <Child>
      <GrandChild>
        <GreatGrandChild />
      </GrandChild>
    </Child>
  </Parent>
</DataContext.Provider>;
```

### Local State Over Global State

```typescript
// ✅ Keep state as local as possible
export function FormComponent() {
  const [formData, setFormData] = useState({}); // Local state
  // Only lift state up when needed by multiple components
}
```

## Bundle Size Optimization

### Tree Shaking

```typescript
// ✅ Import only what you need
import { format } from "date-fns";

// ❌ Imports entire library
import * as dateFns from "date-fns";
```

### Avoid Large Dependencies

```typescript
// Check bundle size before adding dependencies
// Use lighter alternatives when possible

// ❌ Heavy library for simple task
import moment from "moment";

// ✅ Lighter alternative
import { format } from "date-fns";
```

## Monitoring Performance

### React DevTools Profiler

```typescript
// Wrap components to profile
<Profiler id="ShiftList" onRender={onRenderCallback}>
  <ShiftList />
</Profiler>
```

### Web Vitals

```typescript
import { getCLS, getFID, getFCP, getLCP, getTTFB } from "web-vitals";

// Track Core Web Vitals
getCLS(console.log);
getFID(console.log);
getFCP(console.log);
getLCP(console.log);
getTTFB(console.log);
```

## Best Practices Summary

### ✅ DO

- Set appropriate `staleTime` and `cacheTime` for queries
- Use `useMemo` for expensive computations
- Use `useCallback` for callbacks passed to children
- Use React.memo for pure components
- Virtualize long lists
- Lazy load routes and heavy components
- Use pagination for large datasets
- Debounce search inputs
- Cancel queries when component unmounts
- Prefetch data when predictable

### ❌ DON'T

- Fetch data unnecessarily
- Create objects/arrays inline in props
- Use index as key for dynamic lists
- Render all items in very long lists
- Import entire libraries when only need parts
- Keep all state global
- Ignore performance warnings in console
- Skip memoization for expensive operations
