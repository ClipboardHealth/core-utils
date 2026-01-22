# Frontend Development: Quick Start

All new frontend code follows redesign standards using the Berlin design system.

## Core Technologies

- **React** with TypeScript (strict mode)
- **Berlin Design System** - Semantic theme tokens
- **parsedApi.ts** - Type-safe API calls with Zod validation
- **React Query** - Data fetching and state management
- **Vitest** - Fast testing with MockAppWrapper
- **MUI** - Component library with custom wrappers

## Decision Trees

### Where Do I Put My Code?

```
I need to add...

├─ New feature with UI?
│  └─> Create FeatureName/ folder
│     ├─> FeatureContainer.tsx (data + state)
│     ├─> FeatureView.tsx (presentation)
│     ├─> api/ folder for hooks
│     └─> components/ for feature-specific UI
│
├─ Reusable UI component?
│  ├─> Used across features? → /components/ComponentName.tsx
│  └─> Feature-specific? → FeatureName/components/ComponentName.tsx
│
├─ Utility function?
│  ├─> Used across features? → /utils/utilityName.ts
│  └─> Feature-specific? → FeatureName/utils/utilityName.ts
│
└─ Custom hook (non-API)?
   ├─> Used across features? → /hooks/useHookName.ts
   └─> Feature-specific? → FeatureName/hooks/useHookName.ts
```

### How Do I Style This?

```
Need to add styles?

├─> ALWAYS use sx prop → sx={(theme) => ({ ... })}
│
├─> Need color? → theme.palette.[category].[shade]
│   Examples: theme.palette.base.strong
│             theme.palette.background.standout
│
├─> Need spacing? → theme.spacing(N) or just N
│   Examples: padding: 5  (20px)
│             marginX: 4  (15px)
│
└─> Need border radius? → theme.borderRadius.[size]
    Examples: theme.borderRadius.medium
```

⚠️ **NEVER:** Raw colors, raw spacing, makeStyles, styled(), CSS files

**See:** `styling.md` for complete guide

### How Do I Test This?

```
Need to write test?

├─ Testing component?
│  └─> render(<Component />, { wrapper: MockAppWrapper })
│
├─ Testing hook?
│  └─> renderHook(() => useHook(), { wrapper: MockAppWrapper })
│
├─ Need API mock?
│  └─> Create handler factory in api/testUtils/handlers.ts
│
└─ Testing user interaction?
   └─> const user = userEvent.setup()
       await user.click(...)
```

⚠️ **NEVER:** Manual QueryClient setup, inline MSW handlers, test implementation details

**See:** `testing.md` for complete guide

### How Do I Call APIs?

```
Need to call API?

├─ Fetching data (GET)?
│  └─> Use parsedApi.ts get() method
│     1. Define Zod schemas
│     2. Export query key factory
│     3. Export invalidation helper
│     4. Implement useQuery hook
│
└─ Mutating data (POST/PUT/PATCH/DELETE)?
   └─> Use parsedApi.ts post/put/patch/remove methods
      1. Define Zod schemas
      2. Implement useMutation hook
      3. Invalidate queries in onSuccess
```

⚠️ **NEVER:** Raw apiClient, skip schema validation, forget to invalidate

**See:** `api-patterns.md` for complete guide

## Feature Folder Structure

```
FeatureName/
├── api/
│   ├── useGetResource.ts
│   ├── useGetResource.test.ts
│   ├── useCreateResource.ts
│   └── testUtils/
│       └── handlers.ts
├── components/
│   ├── ResourceCard.tsx
│   └── ResourceModal.tsx
├── hooks/
│   └── useResourceState.ts
├── utils/
│   ├── formatResource.ts
│   └── formatResource.test.ts
├── FeatureContainer.tsx
├── FeatureView.tsx
├── types.ts
└── constants.ts
```

## Next Steps

1. Read `architecture.md` for Container/View pattern
2. Read `styling.md` for Berlin design system essentials
3. Read `testing.md` for test patterns
4. Read `api-patterns.md` for data fetching
5. Check your repo's documentation for specific examples
