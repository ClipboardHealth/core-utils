# Data Fetching Standards

## Technology Stack

- **React Query** (@tanstack/react-query) for all API calls
- **Zod** for response validation

## Core Principles

1. **Use URL and query parameters in query keys** - Makes cache invalidation predictable
2. **Define Zod schemas** for all API requests/responses
3. **Rely on React Query state** - Use `isLoading`, `isError`, `isSuccess`
4. **Use `enabled` for conditional fetching**
5. **Use `invalidateQueries` for disabled queries** - Not `refetch()` which ignores enabled state

## Hook Patterns

```typescript
// Simple query
export function useGetUser(userId: string) {
  return useQuery({
    queryKey: ["users", userId],
    queryFn: () => api.get(`/users/${userId}`),
    responseSchema: userSchema,
    enabled: !!userId,
  });
}

// Paginated query
export function usePaginatedItems(params: Params) {
  return useInfiniteQuery({
    queryKey: ["items", params],
    queryFn: ({ pageParam }) => api.get("/items", { cursor: pageParam, ...params }),
    getNextPageParam: (lastPage) => lastPage.nextCursor,
  });
}

// Mutations
export function useCreateItem() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: CreateItemRequest) => api.post("/items", data),
    onSuccess: () => queryClient.invalidateQueries(["items"]),
  });
}
```

## Error Handling

```typescript
useQuery({
  queryKey: ["resource"],
  queryFn: fetchResource,
  useErrorBoundary: (error) => {
    // Show error boundary for 500s, not 404s
    return !(axios.isAxiosError(error) && error.response?.status === 404);
  },
  retry: (failureCount, error) => {
    // Don't retry 4xx errors
    if (axios.isAxiosError(error) && error.response?.status < 500) return false;
    return failureCount < 3;
  },
});
```

## Query Keys

```typescript
// Include URL and params for predictable cache invalidation
export const queryKeys = {
  users: ["users"] as const,
  user: (id: string) => ["users", id] as const,
  userPosts: (id: string) => ["users", id, "posts"] as const,
};
```

## Conditional Fetching

```typescript
const { data } = useQuery({
  queryKey: ["resource", id],
  queryFn: () => fetchResource(id),
  enabled: !!id, // Only fetch when id exists
});
```

## Naming Conventions

- `useGetX` - Simple queries
- `usePaginatedX` - Infinite queries
- `useCreateX`, `useUpdateX`, `useDeleteX` - Mutations

## Hook Location

Place in `api/` folder within feature directory. One endpoint = one hook.
