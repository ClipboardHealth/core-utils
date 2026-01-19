# Custom Hooks

## Naming

- Prefix with `use`
- Boolean: `useIs*`, `useHas*`, `useCan*`
- Data: `useGet*`, `use*Data`
- Actions: `useSubmit*`, `useCreate*`

## Structure

```typescript
export function useFeature(params: Params, options: Options = {}) {
  const query = useQuery(...);
  const computed = useMemo(() => transform(query.data), [query.data]);
  const handleAction = useCallback(async () => { ... }, []);

  return { data: computed, isLoading: query.isLoading, handleAction };
}
```

## Shared State with Constate

```typescript
import constate from "constate";

function useFilters() {
  const [filters, setFilters] = useState<Filters>({});
  return { filters, setFilters };
}

export const [FiltersProvider, useFiltersContext] = constate(useFilters);
```

Use constate for: sharing state between siblings, feature-level state.
Don't use for: server state (use React Query), simple parent-child (use props).
