---
description: "Implementing data fetching, API response fixtures, and error handling: React Query, MSW, Playwright, caching, parsedApi"
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

Include the URL and params so cache invalidation is predictable: `["users", userId, "posts"]`.

## React Query Traps

Each of these is correct-looking code with a non-local effect. They are API behaviours, not
performance advice — the default is the trap.

- **A disabled query still reports `isLoading: true`.** In v4 a query with `enabled: false` sits in
  the `loading` status forever, so any `if (!isLoading)` gate fires immediately with no data. Gate
  on the data itself, or on `isFetching`. (v5 renames this state to `isPending` and the same trap
  applies.)
- **A bare `[url]` key passed to `invalidateQueries` is a prefix sweep.** The default is
  `exact: false`, so it refetches every param variant of that URL that has a live observer, not the
  one you meant. Pass the full key, or `{ exact: true }`.
- **`getNextPageParam` that never returns `undefined` makes an infinite query accumulate forever.**
  Return `undefined` when the last page is short or the cursor is absent; a page count that always
  increments will keep appending duplicate rows.
- **A query differing from an existing one only in fetch-shaping params is a structural cache
  miss.** Page size, sort and include flags are part of the key, so the variant starts empty and no
  `staleTime` or `gcTime` setting can make it hit. Shape the response after fetching, or accept the
  second fetch deliberately.
- **Toggling between two queries with `enabled` empties the data for a round trip.** The consuming
  subtree sees `undefined`, unmounts, and remounts when the new data lands. Use
  `keepPreviousData` (v5: `placeholderData: keepPreviousData`), or keep one query and vary its
  params.

## `parsedApi.ts` vs `api.ts`

Frontend repos have two API layers:

- **`api.ts`** (legacy) — does not parse responses through Zod schemas. Inferred types say `Date` for `dateTimeSchema()` fields but the runtime value is still a string. Zod transforms (`.transform()`, `dateTimeSchema()`, enum fallbacks) produce **incorrect types at runtime**.
- **`parsedApi.ts`** — parses both inputs (`z.input`) and outputs (`z.output`) through schemas. Types match runtime values.

Use `parsedApi.ts` for all new API calls. However, `parsedApi.ts` means invalid contract schemas will fail at runtime — ensure contracts are forwards-compatible. Do not use `parsedApi.ts` if the contract contains bare `z.enum()` values that the backend may extend, as new enum values will cause parse failures on old clients. Migrate bare `z.enum()` to `requiredEnumWithFallback`/`optionalEnumWithFallback` first.

## Test Utilities

Co-locate MSW handlers and mock data in adjacent `testUtils/` folders alongside data-fetching hooks.

### Contract-Derived Response Fixtures

Construct every API response fixture through the producer-owned contract response schema before
passing it to MSW or Playwright. This makes contract drift fail when the fixture is constructed
instead of later in a test or in production.

```typescript
import { featureContract } from "@clipboard-health/contract-feature-service";

const featureResponseSchema = featureContract.getFeature.responses[200];

export const mockFeatureResponse = featureResponseSchema.parse({
  data: { id: "feature-id", name: "Example" },
});
```

For fixtures that need many shallow variants, use `createContractFixtureBuilder` from
`@clipboard-health/testing-core`. Its defaults and overrides are inferred from the schema input, and
every result is parsed at construction.

```typescript
import { createContractFixtureBuilder } from "@clipboard-health/testing-core";

const buildFeatureResponse = createContractFixtureBuilder({
  schema: featureResponseSchema,
  defaults: { data: { id: "feature-id", name: "Default" } },
});

export const mockRenamedFeatureResponse = buildFeatureResponse({
  data: { id: "feature-id", name: "Renamed" },
});
```

A TypeScript annotation or `satisfies` check is not sufficient because neither validates the fixture
at runtime. Do not replace the producer-owned schema with an app-local schema copy.

The shared `contractFixtures` Oxlint preset reports legacy violations as warnings and local
overrides block violations in migrated directories. Ratchet whole directories only after their
response fixtures are migrated; do not suppress violations or downgrade a migrated directory.

The source of truth for this rule is
`packages/ai-rules/rules/frontend/dataFetching.md` in the `core-utils` repository. Do not edit
generated `.rules` copies in consumer repositories directly; upgrade
`@clipboard-health/ai-rules` and run `node --run sync-ai-rules` instead.
