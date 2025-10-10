# Data Fetching Standards

## Technology Stack

- **React Query** (@tanstack/react-query) for all API calls
- **Axios** for HTTP requests
- **Zod** for response validation

## Core Principles

1. **Use URL and query parameters in query keys** - Makes cache invalidation predictable
2. **Always use `useGetQuery` hook** - Provides consistent structure, logging, and validation
3. **Define Zod schemas** for all API requests and responses
4. **Log errors with centralized constants** - From `APP_V2_APP_EVENTS`, never inline strings
5. **Rely on React Query state** - Use `isLoading`, `isError`, `isSuccess` - don't reinvent state management
6. **Use `enabled` for conditional fetching** - With `isDefined()` helper
7. **Use `invalidateQueries` for disabled queries** - Not `refetch()` which ignores enabled state

## Hook Patterns

### Simple Query

```typescript
export function useGetUser(userId: string) {
  return useGetQuery({
    url: `/api/users/${userId}`,
    responseSchema: userSchema,
    enabled: isDefined(userId),
    staleTime: minutesToMilliseconds(5),
    meta: {
      logErrorMessage: APP_V2_APP_EVENTS.GET_USER_FAILURE,
    },
  });
}
```

### Infinite/Paginated Query

```typescript
export function usePaginatedShifts(params: Params) {
  return useInfiniteQuery({
    queryKey: ["shifts", params],
    queryFn: async ({ pageParam }) => {
      const response = await get({
        url: "/api/shifts",
        queryParams: { cursor: pageParam, ...params },
        responseSchema: shiftsResponseSchema,
      });
      return response.data;
    },
    getNextPageParam: (lastPage) => lastPage.links.nextCursor,
  });
}
```

### Composite Data Fetching

```typescript
// Hook that combines multiple queries
export function useWorkerBookingsData() {
  const { data: shifts, isLoading: isLoadingShifts, refetch: refetchShifts } = useGetShifts();
  const { data: invites, isLoading: isLoadingInvites, refetch: refetchInvites } = useGetInvites();

  // Combine data
  const bookings = useMemo(() => {
    return [...(shifts ?? []), ...(invites ?? [])];
  }, [shifts, invites]);

  // Combine loading states
  const isLoading = isLoadingShifts || isLoadingInvites;

  // Combine refetch functions
  async function refreshAllData() {
    await Promise.all([refetchShifts(), refetchInvites()]);
  }

  return {
    bookings,
    isLoading,
    refreshAllData,
  };
}
```

## Error Handling

Always use centralized error constants and handle expected errors gracefully:

```typescript
useGetQuery({
  url: "/api/resource",
  responseSchema: schema,
  meta: {
    logErrorMessage: APP_V2_APP_EVENTS.GET_RESOURCE_FAILURE, // ✅ Centralized
    userErrorMessage: "Failed to load data", // Shows alert to user
  },
  useErrorBoundary: (error) => {
    // Don't show error boundary for 404s (expected errors)
    return !(axios.isAxiosError(error) && error.response?.status === 404);
  },
  retry: (failureCount, error) => {
    // Don't retry 404s or 401s
    if (axios.isAxiosError(error)) {
      const status = error.response?.status;
      return ![404, 401].includes(status ?? 0);
    }
    return failureCount < 3;
  },
});
```

## State Management - Don't Reinvent the Wheel

❌ **Don't** create your own loading/error state:

```typescript
const [data, setData] = useState();
const [isLoading, setIsLoading] = useState(false);
const [error, setError] = useState();

useEffect(() => {
  async function fetchData() {
    try {
      setIsLoading(true);
      const result = await api.get("/data");
      setData(result);
    } catch (err) {
      setError(err);
    } finally {
      setIsLoading(false);
    }
  }
  fetchData();
}, []);
```

✅ **Do** use React Query states:

```typescript
const { data, isLoading, isError, isSuccess } = useGetQuery({...});

if (isLoading) return <Loading />;
if (isError) return <Error />;
if (isSuccess) return <div>{data.property}</div>;
```

## Mutations

```typescript
export function useCreateDocument() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (data: CreateDocumentRequest) => {
      return await post({
        url: "/api/documents",
        data,
        responseSchema: documentSchema,
      });
    },
    onSuccess: () => {
      // Invalidate queries to refetch
      queryClient.invalidateQueries(["documents"]);
    },
    onError: (error) => {
      logEvent(APP_V2_APP_EVENTS.CREATE_DOCUMENT_FAILURE, { error });
    },
  });
}
```

## Query Keys

Always include URL and parameters in query keys:

```typescript
// ❌ Don't use static strings
useQuery({ queryKey: "users", ... });

// ✅ Do include URL and params
useQuery({ queryKey: [`/api/users?${status}`, { status }], ... });

// Consistent query key structure
export const queryKeys = {
  users: ["users"] as const,
  user: (id: string) => ["users", id] as const,
  userShifts: (id: string) => ["users", id, "shifts"] as const,
};

// Usage
useQuery({
  queryKey: queryKeys.user(userId),
  // ...
});
```

## Refetch Intervals

```typescript
useGetQuery({
  url: "/api/resource",
  responseSchema: schema,
  refetchInterval: (data) => {
    // Dynamic refetch based on data state
    if (!data?.isComplete) {
      return 1000; // Poll every second until complete
    }
    return 0; // Stop refetching
  },
});
```

## Conditional Fetching

Use `enabled` option with `isDefined()` helper:

```typescript
import { isDefined } from "@src/appV2/lib";

const { data } = useGetQuery({
  url: "/api/resource",
  responseSchema: schema,
  // Only fetch when conditions are met
  enabled: isDefined(userId) && isFeatureEnabled,
});
```

## Refetch vs InvalidateQueries

**Important:** For disabled queries, use `invalidateQueries` instead of `refetch`:

❌ **Don't** use `refetch()` on disabled queries:

```typescript
const { refetch, data } = useGetQuery({
  enabled: isDefined(shift.agentId),
  ...
});

// Will fetch even if agentId is undefined!
refetch();
```

✅ **Do** use `invalidateQueries`:

```typescript
const queryClient = useQueryClient();

const { data } = useGetQuery({
  enabled: isDefined(shift.agentId),
  ...
});

// Respects the enabled state
queryClient.invalidateQueries({ queryKey: [myQueryKey] });
```

## Query Cancellation

```typescript
export function usePaginatedData() {
  const queryClient = useQueryClient();

  return useInfiniteQuery({
    queryKey: ["data"],
    queryFn: async ({ pageParam }) => {
      // Cancel previous in-flight requests
      await queryClient.cancelQueries({ queryKey: ["data"] });

      const response = await get({
        url: "/api/data",
        queryParams: { cursor: pageParam },
      });
      return response.data;
    },
    // ...
  });
}
```

## Naming Conventions

- **useGet\*** - Simple queries: `useGetUser`, `useGetShift`
- **usePaginated\*** - Infinite queries: `usePaginatedPlacements`
- **useFetch\*** - Complex fetching logic: `useFetchPaginatedInterviews`
- **Mutations**: `useCreateDocument`, `useUpdateShift`, `useDeletePlacement`

## Response Transformation

```typescript
export function useGetUser(userId: string) {
  return useGetQuery({
    url: `/api/users/${userId}`,
    responseSchema: userResponseSchema,
    select: (data) => {
      // Transform response data
      return {
        ...data,
        fullName: `${data.firstName} ${data.lastName}`,
      };
    },
  });
}
```

## Hook Location

- **API hooks** → Place in `api/` folder within feature directory
- **One endpoint = one hook** principle
- Export types inferred from Zod: `export type User = z.infer<typeof userSchema>`

Example:

```text
Feature/
├── api/
│   ├── useGetResource.ts
│   ├── useCreateResource.ts
│   └── schemas.ts  (optional)
```
