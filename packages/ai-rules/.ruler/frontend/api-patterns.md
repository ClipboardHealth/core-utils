# API Patterns

## Core Principles

1. **Use parsedApi.ts** (not raw apiClient) for type-safe API calls
2. **Mandatory Zod validation** for all request/response data
3. **Query key factories** for predictable cache invalidation
4. **Export invalidation helpers** for mutations to use
5. **Export inferred types** from Zod schemas

**Why?** parsedApi.ts ensures runtime type safety through Zod validation, catching API contract violations at the boundary. Query key factories enable consistent cache invalidation across the app.

## Technology Stack

- **React Query** (@tanstack/react-query) for data fetching and caching
- **Zod** for runtime schema validation
- **parsedApi.ts** for type-safe HTTP client

## parsedApi.ts Methods

```typescript
import { get, post, put, patch, remove } from "@src/appV2/api/parsedApi";

// All methods support:
// - url: string
// - queryParams?: object with queryParamsSchema
// - data?: object with bodySchema (for mutations)
// - responseSchema: ZodSchema (required)
```

## Query Hook Pattern

### Complete Example

```typescript
import { get } from "@src/appV2/api/parsedApi";
import { useQuery, type QueryClient } from "@tanstack/react-query";
import { z } from "zod";

// 1. Define Zod schemas
const queryParamsSchema = z.object({
  workplaceId: z.string(),
  page: z.number().optional(),
  pageSize: z.number().optional(),
});

const responseSchema = z.object({
  id: z.string(),
  name: z.string(),
  status: z.enum(["active", "inactive"]),
});

// 2. Export inferred types
export type Resource = z.infer<typeof responseSchema>;
export type GetResourceParams = z.infer<typeof queryParamsSchema>;

// 3. Export query key factory
export function getResourceQueryKey(params: GetResourceParams) {
  return ["resources", params.workplaceId, { page: params.page }] as const;
}

// 4. Export invalidation helper
export function invalidateResourceQueries(
  queryClient: QueryClient,
  workplaceId: string
) {
  return queryClient.invalidateQueries({
    queryKey: ["resources", workplaceId],
  });
}

// 5. Implement hook
export function useGetResource(params: GetResourceParams) {
  return useQuery({
    queryKey: getResourceQueryKey(params),
    queryFn: async () => {
      const response = await get({
        url: `/workplaces/${params.workplaceId}/resources`,
        queryParams: { page: params.page, pageSize: params.pageSize },
        queryParamsSchema,
        responseSchema,
      });
      return response.data;
    },
    enabled: !!params.workplaceId,  // Conditional fetching
  });
}
```

## Mutation Hook Pattern

### Complete Example

```typescript
import { post } from "@src/appV2/api/parsedApi";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { z } from "zod";
import { invalidateResourceQueries } from "./useGetResource";

// 1. Define schemas
const requestSchema = z.object({
  name: z.string().min(1),
  status: z.enum(["active", "inactive"]),
});

const responseSchema = z.object({
  id: z.string(),
  name: z.string(),
  status: z.enum(["active", "inactive"]),
});

// 2. Export types
export type CreateResourceRequest = z.infer<typeof requestSchema>;
export type CreateResourceResponse = z.infer<typeof responseSchema>;

// 3. Implement mutation hook
export function useCreateResource() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (params: CreateResourceRequest & { workplaceId: string }) => {
      const response = await post({
        url: `/workplaces/${params.workplaceId}/resources`,
        data: params,
        bodySchema: requestSchema,
        responseSchema,
      });
      return response.data;
    },
    onSuccess: (_data, variables) => {
      // Invalidate related queries
      invalidateResourceQueries(queryClient, variables.workplaceId);
    },
    meta: {
      logErrorMessage: "CREATE_RESOURCE_FAILURE",
    },
  });
}
```

## Before/After Anti-Patterns

### Using Raw apiClient

```typescript
// ❌ WRONG: Raw apiClient, no validation
import { apiClient } from "@src/api/apiClient";

export function useGetResource(id: string) {
  return useQuery({
    queryKey: ["resource", id],
    queryFn: async () => {
      const response = await apiClient.get(`/resources/${id}`);
      return response.data;  // No type safety!
    },
  });
}
```

```typescript
// ✅ CORRECT: parsedApi.ts with Zod validation
import { get } from "@src/appV2/api/parsedApi";

export function useGetResource(id: string) {
  return useQuery({
    queryKey: getResourceQueryKey(id),
    queryFn: async () => {
      const response = await get({
        url: `/resources/${id}`,
        responseSchema,  // Runtime validation
      });
      return response.data;  // Type-safe!
    },
  });
}
```

### Hardcoded Query Keys

```typescript
// ❌ WRONG: Hardcoded query keys
export function useGetResource(id: string) {
  return useQuery({
    queryKey: ["resource", id],  // Hardcoded
    // ...
  });
}

// When invalidating in another file:
queryClient.invalidateQueries({ queryKey: ["resource", id] });  // Fragile!
```

```typescript
// ✅ CORRECT: Query key factory
export function getResourceQueryKey(id: string) {
  return ["resources", id] as const;
}

export function useGetResource(id: string) {
  return useQuery({
    queryKey: getResourceQueryKey(id),  // Consistent
    // ...
  });
}

// When invalidating:
queryClient.invalidateQueries({
  queryKey: getResourceQueryKey(id)  // Type-safe
});
```

### Missing Invalidation After Mutations

```typescript
// ❌ WRONG: No invalidation
export function useCreateResource() {
  return useMutation({
    mutationFn: createResource,
    // Missing onSuccess!
  });
}
```

```typescript
// ✅ CORRECT: Invalidate related queries
export function useCreateResource() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: createResource,
    onSuccess: (_data, variables) => {
      invalidateResourceQueries(queryClient, variables.workplaceId);
    },
  });
}
```

### Skipping Schema Validation

```typescript
// ❌ WRONG: No schema validation
const response = await get({
  url: "/resources",
  // Missing responseSchema!
});
```

```typescript
// ✅ CORRECT: Always validate
const response = await get({
  url: "/resources",
  responseSchema,  // Mandatory
});
```

## Query Key Structure

Query keys should be hierarchical and include all parameters affecting the data:

```typescript
// ✅ GOOD: Hierarchical structure
["resources"]                                    // All resources
["resources", workplaceId]                      // Workplace's resources
["resources", workplaceId, { page: 1 }]        // With pagination
["resources", workplaceId, { filters: {...} }]  // With filters

// This enables partial invalidation:
queryClient.invalidateQueries({ queryKey: ["resources", workplaceId] });
// ↑ Invalidates ALL queries for this workplace
```

## Conditional Fetching

Use the `enabled` option to control when queries run:

```typescript
export function useGetResource(params: { id?: string }) {
  return useQuery({
    queryKey: getResourceQueryKey(params.id),
    queryFn: async () => {
      const response = await get({
        url: `/resources/${params.id}`,
        responseSchema,
      });
      return response.data;
    },
    enabled: !!params.id,  // Only fetch when id exists
  });
}
```

## Error Handling

### In Queries

```typescript
export function useGetResource(id: string) {
  return useQuery({
    queryKey: getResourceQueryKey(id),
    queryFn: fetchResource,
    meta: {
      logErrorMessage: "GET_RESOURCE_FAILURE",  // Automatic logging
    },
  });
}

// In component:
const { data, isError, error } = useGetResource(id);

if (isError) {
  return <ErrorState message={error.message} />;
}
```

### In Mutations

```typescript
export function useCreateResource() {
  return useMutation({
    mutationFn: createResource,
    onSuccess: () => {
      showSuccessToast("Resource created");
    },
    onError: (error) => {
      logError("CREATE_RESOURCE_FAILURE", error);
      showErrorToast("Failed to create resource");
    },
    meta: {
      logErrorMessage: "CREATE_RESOURCE_FAILURE",
    },
  });
}
```

## Array Response Schema

When the API returns an array, wrap it in an object schema:

```typescript
// ❌ WRONG: Array schema directly
const responseSchema = z.array(z.object({ ... }));

// ✅ CORRECT: Wrap in object
const responseSchema = z.object({
  data: z.array(z.object({
    id: z.string(),
    name: z.string(),
  })),
});

// Access with response.data.data
const response = await get({ url: "/resources", responseSchema });
return response.data.data;  // The array
```

## File Organization

```
FeatureName/
├── api/
│   ├── useGetResource.ts           # Query hook
│   ├── useGetResource.test.ts      # Tests
│   ├── useCreateResource.ts        # Mutation hook
│   ├── useUpdateResource.ts        # Mutation hook
│   └── testUtils/
│       └── handlers.ts             # MSW mocks
```

## Common Patterns

### Dependent Queries

```typescript
const { data: user } = useGetUser(userId);
const { data: posts } = useGetUserPosts(
  { userId: user?.id },
  { enabled: !!user?.id }  // Wait for user data
);
```

### Optimistic Updates

```typescript
export function useUpdateResource() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: updateResource,
    onMutate: async (variables) => {
      // Cancel ongoing queries
      await queryClient.cancelQueries({ queryKey: ["resources"] });

      // Snapshot current value
      const previous = queryClient.getQueryData(["resources"]);

      // Optimistically update
      queryClient.setQueryData(["resources"], (old) => ({
        ...old,
        ...variables,
      }));

      return { previous };
    },
    onError: (_err, _variables, context) => {
      // Rollback on error
      queryClient.setQueryData(["resources"], context?.previous);
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ["resources"] });
    },
  });
}
```

## Complete API Reference

This guide covers essential API patterns. For comprehensive details including:

- Infinite queries with pagination
- Complex error handling strategies
- Advanced caching patterns
- Query invalidation strategies
- Real examples from your codebase

**See your repo's documentation:**
- `src/appV2/redesign/docs/API_PATTERNS.md` - Complete API guide
- `src/appV2/redesign/CLAUDE.md` - Quick API decision tree
