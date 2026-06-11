---
description: "Creating React custom hooks: naming, shared state with constate"
---

# Custom Hooks

## Naming

- Boolean: `useIs*`, `useHas*`, `useCan*`
- Data: `useGet*`, `use*Data`
- Actions: `useSubmit*`, `useCreate*`

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
