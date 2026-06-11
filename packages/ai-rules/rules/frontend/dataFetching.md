---
description: "Implementing data fetching and error handling: React Query, API calls, caching, parsedApi"
---

# Data Fetching

## Core Rules

1. Use React Query for all API calls
2. Define Zod schemas for all request/response types
3. Use the `enabled` option for conditional fetching: `{ enabled: isDefined(dependencyData?.id) }`
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
- Do not use the deprecated `onError` callback for useQuery queries — use the `meta` pattern. `onError` remains valid for useMutation.

```typescript
useMutation({
  mutationFn: createItem,
  onSuccess: () => {
    showSuccessToast("Created");
    queryClient.invalidateQueries(["items"]);
  },
  meta: {
    logErrorMessage: APP_EVENTS.CREATE_FAILURE,
    userErrorMessage: "Failed to create",
  },
});
```

## Query Keys

Include URL and params for predictable cache invalidation:

```typescript
queryKey: ["users", userId];
queryKey: ["users", userId, "posts"];
```

## `parsedApi.ts` vs `api.ts`

Frontend repos have two API layers:

- **`api.ts`** (legacy) — does not parse responses through Zod schemas. Inferred types say `Date` for `dateTimeSchema()` fields but the runtime value is still a string. Zod transforms (`.transform()`, `dateTimeSchema()`, enum fallbacks) produce **incorrect types at runtime**.
- **`parsedApi.ts`** — parses both inputs (`z.input`) and outputs (`z.output`) through schemas. Types match runtime values.

Use `parsedApi.ts` for all new API calls. However, `parsedApi.ts` means invalid contract schemas will fail at runtime — ensure contracts are forwards-compatible. Do not use `parsedApi.ts` if the contract contains bare `z.enum()` values that the backend may extend, as new enum values will cause parse failures on old clients. Migrate bare `z.enum()` to `requiredEnumWithFallback`/`optionalEnumWithFallback` first.

## Test Utilities

Co-locate MSW handlers and mock data in adjacent `testUtils/` folders alongside data-fetching hooks.
