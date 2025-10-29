# Custom Hook Standards

## Hook Structure

```typescript
export function useFeature(params: Params, options: UseFeatureOptions = {}) {
  const query = useQuery(...);
  const computed = useMemo(() => transformData(query.data), [query.data]);
  const handleAction = useCallback(async () => { /* ... */ }, []);

  return { data: computed, isLoading: query.isLoading, handleAction };
}
```

## Naming Rules

- **Always** prefix with `use`
- Boolean: `useIsEnabled`, `useHasPermission`
- Data: `useGetUser`, `useFeatureData`
- Actions: `useSubmitForm`

## Return Values

- Return objects (not arrays) for complex hooks
- Name clearly: `isLoading` not `loading`

## State Management with Constate

Use `constate` for shared state between components:

```typescript
import constate from "constate";

function useFilters() {
  const [filters, setFilters] = useState<Filters>({});
  return { filters, setFilters };
}

export const [FiltersProvider, useFiltersContext] = constate(useFilters);
```

**When to use:** Sharing state between siblings, feature-level state
**When NOT:** Server state (use React Query), simple parent-child (use props)

## Hook Patterns

```typescript
// Boolean hooks
export function useIsFeatureEnabled(): boolean {
  return useFeatureFlags().includes("feature");
}

// Data transformation
export function useTransformedData() {
  const { data, isLoading } = useGetRawData();
  const transformed = useMemo(() => data?.map(format), [data]);
  return { data: transformed, isLoading };
}

// Composite hooks
export function useBookingsData() {
  const shifts = useGetShifts();
  const invites = useGetInvites();

  const combined = useMemo(
    () => [...(shifts.data ?? []), ...(invites.data ?? [])],
    [shifts.data, invites.data],
  );

  return { data: combined, isLoading: shifts.isLoading || invites.isLoading };
}
```

## Best Practices

- Use options object for flexibility
- Be explicit about dependencies
- API hooks in `api/`, logic hooks in `hooks/`
- Return stable references with `useCallback`/`useMemo`
