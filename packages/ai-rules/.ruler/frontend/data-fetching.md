# Data Fetching

## Core Rules

1. **Use React Query** for all API calls (not local state)
2. **Use provided query states** (`isLoading`, `isError`, `isSuccess`) - don't create custom state
3. **Use `enabled` option** for conditional fetching
4. **Use `invalidateQueries`** (not `refetch`) for disabled queries
5. **Define Zod schemas** for all request/response types

**Why?** React Query manages server state (caching, background updates, stale data) better than local state ever could. Use its built-in states instead of reinventing the wheel.

## Technology Stack

- **React Query** (@tanstack/react-query) for data fetching and caching
- **parsedApi.ts** for type-safe HTTP client
- **Zod** for runtime validation

## Query States - Use What's Provided

React Query provides comprehensive states. Use them instead of creating your own:

```typescript
export function DataComponent() {
  const { data, isLoading, isError, isSuccess, error, refetch } = useGetData();

  // ✅ Use provided states
  if (isLoading) return <LoadingState />;
  if (isError) return <ErrorState error={error} onRetry={refetch} />;
  if (!data) return <EmptyState />;

  return <DataDisplay data={data} />;
}
```

### Available States

```typescript
const {
  data,           // The fetched data
  error,          // Error object if failed
  isLoading,      // Initial load
  isFetching,     // Any fetch (including background)
  isError,        // Request failed
  isSuccess,      // Request succeeded
  isPending,      // Query not yet resolved
  isStale,        // Data is stale (needs refresh)
  refetch,        // Manual refetch function
} = useQuery({ ... });
```

## Anti-Pattern: Custom Loading State

```typescript
// ❌ WRONG: Creating custom loading state
export function DataComponent() {
  const [isLoading, setIsLoading] = useState(true);  // Don't do this!
  const { data } = useGetData();

  useEffect(() => {
    if (data) setIsLoading(false);
  }, [data]);

  if (isLoading) return <Loading />;
  // ...
}
```

```typescript
// ✅ CORRECT: Use React Query's state
export function DataComponent() {
  const { data, isLoading } = useGetData();

  if (isLoading) return <Loading />;
  // ...
}
```

## Conditional Fetching

Use the `enabled` option to control when queries run:

```typescript
// Wait for dependency
const { data: user } = useGetUser(userId);
const { data: posts } = useGetUserPosts(
  { userId: user?.id },
  { enabled: !!user?.id }  // Only fetch when user exists
);

// Based on user interaction
const [shouldFetch, setShouldFetch] = useState(false);
const { data } = useGetData({ enabled: shouldFetch });

// Based on permission
const { hasPermission } = usePermissions();
const { data } = useGetSensitiveData({ enabled: hasPermission });
```

## Refreshing Disabled Queries

When a query is disabled, use `invalidateQueries` (not `refetch`) to trigger a fresh fetch:

```typescript
// ❌ WRONG: refetch doesn't work for disabled queries
const { data, refetch } = useGetData({ enabled: false });
refetch();  // Won't work!

// ✅ CORRECT: Use invalidateQueries
const queryClient = useQueryClient();
const { data } = useGetData({ enabled: false });

const handleRefresh = () => {
  queryClient.invalidateQueries({ queryKey: ["data"] });
};
```

## Query Configuration

Common query options:

```typescript
export function useGetResource(id: string) {
  return useQuery({
    queryKey: getResourceQueryKey(id),
    queryFn: fetchResource,
    enabled: !!id,                    // Conditional fetching
    staleTime: 5 * 60 * 1000,        // 5 minutes before stale
    gcTime: 10 * 60 * 1000,          // 10 minutes before garbage collection
    refetchOnWindowFocus: true,       // Refetch on tab focus
    refetchOnReconnect: true,         // Refetch on reconnect
    retry: 3,                         // Retry failed requests 3 times
    meta: {
      logErrorMessage: "GET_RESOURCE_FAILURE",
    },
  });
}
```

## Mutations

Mutations modify server data. Always invalidate related queries in `onSuccess`:

```typescript
export function useCreateResource() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: createResource,
    onSuccess: (_data, variables) => {
      // Invalidate related queries to trigger refetch
      queryClient.invalidateQueries({
        queryKey: ["resources", variables.workplaceId],
      });

      showSuccessToast("Resource created");
    },
    onError: (error) => {
      logError("CREATE_RESOURCE_FAILURE", error);
      showErrorToast("Failed to create resource");
    },
  });
}
```

### Mutation States

```typescript
export function CreateResourceForm() {
  const createMutation = useCreateResource();

  const handleSubmit = async (data: FormData) => {
    await createMutation.mutateAsync(data);
  };

  return (
    <form onSubmit={handleSubmit}>
      <Button
        type="submit"
        disabled={createMutation.isPending}
        loading={createMutation.isPending}
      >
        {createMutation.isPending ? "Creating..." : "Create"}
      </Button>

      {createMutation.isError && (
        <ErrorMessage>{createMutation.error.message}</ErrorMessage>
      )}
    </form>
  );
}
```

## Cache Invalidation

After mutations, invalidate related queries:

```typescript
// Invalidate all resources
queryClient.invalidateQueries({ queryKey: ["resources"] });

// Invalidate specific workplace's resources
queryClient.invalidateQueries({ queryKey: ["resources", workplaceId] });

// Invalidate multiple queries
queryClient.invalidateQueries({ queryKey: ["resources"] });
queryClient.invalidateQueries({ queryKey: ["users"] });
```

## Dependent Queries

When one query depends on another:

```typescript
export function UserProfile({ userId }: Props) {
  // First query
  const { data: user, isLoading: userLoading } = useGetUser(userId);

  // Second query waits for first
  const { data: posts, isLoading: postsLoading } = useGetUserPosts(
    { userId: user?.id },
    { enabled: !!user?.id }  // Wait for user data
  );

  if (userLoading) return <Loading />;
  if (!user) return <NotFound />;

  return (
    <div>
      <UserHeader user={user} />
      {postsLoading ? <PostsLoading /> : <PostsList posts={posts} />}
    </div>
  );
}
```

## Background Refetching

React Query automatically refetches stale data in the background:

```typescript
export function DataComponent() {
  const { data, isFetching } = useGetData();

  return (
    <div>
      {isFetching && <RefreshingIndicator />}  {/* Background fetch */}
      <DataDisplay data={data} />
    </div>
  );
}
```

## Manual Refetch

```typescript
export function DataComponent() {
  const { data, refetch } = useGetData();

  const handleRefresh = async () => {
    await refetch();  // Manual refetch
  };

  return (
    <div>
      <Button onClick={handleRefresh}>Refresh</Button>
      <DataDisplay data={data} />
    </div>
  );
}
```

## Error Handling

### Query Errors

```typescript
export function DataComponent() {
  const { data, isError, error, refetch } = useGetData();

  if (isError) {
    return (
      <ErrorState
        message={error.message}
        onRetry={refetch}
      />
    );
  }

  return <DataDisplay data={data} />;
}
```

### Mutation Errors

```typescript
export function CreateForm() {
  const createMutation = useCreateResource();

  const handleSubmit = async (data: FormData) => {
    try {
      await createMutation.mutateAsync(data);
      showSuccessToast("Created successfully");
    } catch (error) {
      // Error already logged by mutation's onError
      // Just handle UI feedback here
      showErrorToast("Failed to create");
    }
  };

  return (
    <form onSubmit={handleSubmit}>
      {/* Form fields */}
      {createMutation.isError && (
        <ErrorMessage>{createMutation.error.message}</ErrorMessage>
      )}
    </form>
  );
}
```

## Complete Data Fetching Reference

This guide covers essential data fetching patterns. For comprehensive details including:

- Infinite queries with pagination
- Optimistic updates
- Query prefetching
- Parallel queries
- Advanced caching strategies
- Real examples from your codebase

**See your repo's documentation:**
- `src/appV2/redesign/docs/API_PATTERNS.md` - Complete API guide
- `src/appV2/redesign/CLAUDE.md` - Quick data fetching decision tree
