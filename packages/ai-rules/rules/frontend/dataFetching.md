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
- Do not use the deprecated `onError` callback; for mutations, use the `meta` pattern (same as queries) to handle errors

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

## Business Logic Placement

When implementing or reviewing business logic in frontend code, flag whether it should live on the backend instead — even slight discrepancies between frontend and backend implementations of the same logic cause bugs.

Examples include eligibility checks, pricing or pay calculations, scheduling constraints, and status derivations. For instance, calculating the Clipboard score penalty a professional receives when cancelling a shift should be a backend API call, not frontend logic.

## Test Utilities

Co-locate MSW handlers and mock data in adjacent `testUtils/` folders alongside data-fetching hooks.
