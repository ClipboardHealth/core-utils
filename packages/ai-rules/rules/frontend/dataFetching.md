# Data Fetching

## Core Rules

1. Use React Query for all API calls
2. Define Zod schemas for all request/response types
3. Use `enabled` option for conditional fetching
4. Use `invalidateQueries` (not `refetch`) for disabled queries

## Hook Pattern

```typescript
// Define in: FeatureName/api/useGetFeature.ts
const responseSchema = z.object({
  id: z.string(),
  name: z.string(),
});

export type FeatureResponse = z.infer<typeof responseSchema>;

export function useGetFeature(id: string, options = {}) {
  return useGetQuery({
    url: `feature/${id}`,
    responseSchema,
    enabled: !!id,
    meta: {
      logErrorMessage: APP_EVENTS.GET_FEATURE_FAILURE,
      userErrorMessage: "Failed to load feature",
    },
    ...options,
  });
}
```

## Error Handling

- Log errors via `meta.logErrorMessage` using centralized event constants
- Display user-facing errors via `meta.userErrorMessage`
- Do not use the deprecated `onError` callback; for queries, use the `meta` pattern to handle errors. This rule doesn't apply to useMutation, using onError for useMutation is a valid pattern

## Query Keys

Include URL and params for predictable cache invalidation:

```typescript
queryKey: ["users", userId];
queryKey: ["users", userId, "posts"];
```

## Conditional Fetching

```typescript
const { data } = useGetFeature(
  { id: dependencyData?.id },
  { enabled: isDefined(dependencyData?.id) },
);
```

## Mutations

```typescript
export function useCreateItem() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: CreateItemRequest) => api.post("/items", data),
    onSuccess: () => queryClient.invalidateQueries(["items"]),
  });
}
```

## Test Utilities

Co-locate MSW handlers and mock data in adjacent `testUtils/` folders alongside data-fetching hooks.
