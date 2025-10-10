# Custom Hook Standards

## Hook Structure

```typescript
interface UseFeatureOptions {
  enabled?: boolean;
  refetchInterval?: number;
}

export function useFeature(params: Params, options: UseFeatureOptions = {}) {
  const { enabled = true } = options;

  // Multiple queries/hooks
  const query1 = useQuery(...);
  const query2 = useQuery(...);

  // Derived state
  const computed = useMemo(() => {
    // Combine data
    return transformData(query1.data, query2.data);
  }, [query1.data, query2.data]);

  // Callbacks
  const handleAction = useCallback(async () => {
    // Perform action
  }, [dependencies]);

  // Return structured object
  return {
    // Data
    data: computed,

    // Loading states
    isLoading: query1.isLoading || query2.isLoading,
    isError: query1.isError || query2.isError,

    // Actions
    refetch: async () => {
      await Promise.all([query1.refetch(), query2.refetch()]);
    },
    handleAction,
  };
}
```

## Naming Rules

- **Always** prefix with `use`
- Boolean hooks: `useIsFeatureEnabled`, `useShouldShowModal`, `useHasPermission`
- Data hooks: `useGetData`, `useFeatureData`
- Action hooks: `useBookShift`, `useSubmitForm`

## Return Values

- Return objects (not arrays) for complex hooks
- Name properties clearly: `isLoading` not `loading`, `refetch` not `refresh`
- Group related properties together

```typescript
// Good - clear property names
return {
  data,
  isLoading,
  isError,
  refetch,
};

// Avoid - array destructuring for complex returns
return [data, isLoading, refetch]; // Only for very simple hooks
```

## State Management with Constate

For local/shared state management, use **`constate`** to create context with minimal boilerplate:

```typescript
import constate from "constate";
import { useState, useCallback } from "react";

// Define your hook with state logic
function useShiftFilters() {
  const [filters, setFilters] = useState<Filters>({});
  const [isLoading, setIsLoading] = useState(false);

  const applyFilters = useCallback((newFilters: Filters) => {
    setFilters(newFilters);
  }, []);

  const clearFilters = useCallback(() => {
    setFilters({});
  }, []);

  return {
    filters,
    isLoading,
    applyFilters,
    clearFilters,
  };
}

// Create provider and hook with constate
export const [ShiftFiltersProvider, useShiftFiltersContext] = constate(useShiftFilters);
```

**Usage:**

```typescript
// Wrap components that need access
function ShiftsPage() {
  return (
    <ShiftFiltersProvider>
      <ShiftList />
      <FilterPanel />
    </ShiftFiltersProvider>
  );
}

// Use in child components
function ShiftList() {
  const { filters, applyFilters } = useShiftFiltersContext();

  // Use shared state
  return <div>{/* ... */}</div>;
}
```

**Benefits:**

- Minimal boilerplate compared to raw Context API
- TypeScript support out of the box
- Avoids prop drilling
- Clean separation of state logic

**When to use Constate:**

- Sharing state between multiple sibling components
- Complex feature-level state (filters, UI state, form state)
- Alternative to prop drilling

**When NOT to use Constate:**

- Server state (use React Query instead)
- Global app state (consider if it's truly needed)
- Simple parent-child communication (use props)

## Boolean Hooks

```typescript
// Pattern: useIs*, useHas*, useShould*
export function useIsFeatureEnabled(): boolean {
  const flags = useFeatureFlags();
  return flags.includes("new-feature");
}

export function useHasPermission(permission: string): boolean {
  const user = useUser();
  return user.permissions.includes(permission);
}

export function useShouldShowModal(): boolean {
  const hasSeenModal = usePreference("hasSeenModal");
  return !hasSeenModal;
}
```

## Data Transformation Hooks

```typescript
export function useTransformedData() {
  const { data: rawData, isLoading, isError } = useGetRawData();

  const transformedData = useMemo(() => {
    if (!rawData) return undefined;

    return rawData.map((item) => ({
      ...item,
      displayName: formatName(item),
    }));
  }, [rawData]);

  return {
    data: transformedData,
    isLoading,
    isError,
  };
}
```

## Side Effect Hooks

```typescript
// Hooks that perform side effects (logging, tracking, etc.)
export function useTrackPageView(pageName: string) {
  useEffect(() => {
    logEvent("PAGE_VIEWED", { pageName });
  }, [pageName]);
}

// Usage
export function MyPage() {
  useTrackPageView("MyPage");
  // ... rest of component
}
```

## Composite Hooks

```typescript
// Combines multiple hooks and data sources
export function useWorkerBookingsData() {
  const worker = useDefinedWorker();
  const isFeatureEnabled = useIsFeatureEnabled("new-bookings");

  const {
    data: shifts,
    isLoading: isLoadingShifts,
    refetch: refetchShifts,
  } = useGetShifts(worker.id);

  const {
    data: invites,
    isLoading: isLoadingInvites,
    refetch: refetchInvites,
  } = useGetInvites(worker.id, { enabled: isFeatureEnabled });

  // Combine data
  const bookings = useMemo(() => {
    return [...(shifts ?? []), ...(invites ?? [])].sort(sortByDate);
  }, [shifts, invites]);

  // Combined loading state
  const isLoading = isLoadingShifts || isLoadingInvites;

  // Combined refetch
  async function refreshAllData() {
    await Promise.all([refetchShifts(), refetchInvites()]);
  }

  return {
    // Data
    bookings,

    // States
    isLoading,
    isFeatureEnabled,

    // Actions
    refreshAllData,
  };
}
```

## Co-location

- Place hooks in `hooks/` folder within feature directory
- Place API hooks in `api/` folder
- Keep generic/shared hooks in `lib/` or `utils/`

```
FeatureName/
├── api/
│   ├── useGetFeature.ts      # API data fetching
│   └── useUpdateFeature.ts
├── hooks/
│   ├── useFeatureLogic.ts    # Business logic hooks
│   ├── useFeatureState.ts    # Constate state hooks
│   └── useFeatureFilters.ts
└── components/
    └── FeatureComponent.tsx
```

## Options Pattern

```typescript
// Always use options object for flexibility
interface UseFeatureOptions {
  enabled?: boolean;
  refetchInterval?: number;
  onSuccess?: (data: Data) => void;
}

export function useFeature(params: Params, options: UseFeatureOptions = {}) {
  const { enabled = true, refetchInterval, onSuccess } = options;

  // Use options in queries
  return useQuery({
    enabled,
    refetchInterval,
    onSuccess,
    // ...
  });
}
```

## Hook Dependencies

```typescript
// Be explicit about dependencies
export function useFormattedData(rawData: Data[]) {
  return useMemo(() => {
    return rawData.map(format);
  }, [rawData]); // Clear dependency
}

// Avoid creating functions in dependency arrays
export function useHandler() {
  const [value, setValue] = useState();

  // Good - stable reference
  const handleChange = useCallback((newValue: string) => {
    setValue(newValue);
  }, []); // No dependencies on value

  return handleChange;
}
```

## Best Practices

- **Prefix with `use`** - Always
- **Return objects, not arrays** - For hooks with multiple values
- **Use constate for shared state** - Avoid prop drilling
- **API hooks in `api/`** - Logic hooks in `hooks/`
- **Clear property names** - `isLoading`, not `loading`
- **Options pattern** - For flexible configuration
- **Explicit dependencies** - In useMemo/useCallback
