# File Organization Standards

## Feature-based Structure

```text
FeatureName/
├── api/                          # Data fetching hooks
│   ├── useGetFeature.ts
│   ├── useUpdateFeature.ts
│   └── useDeleteFeature.ts
├── components/                   # Feature-specific components
│   ├── FeatureCard.tsx
│   ├── FeatureList.tsx
│   └── FeatureHeader.tsx
├── hooks/                        # Feature-specific hooks (non-API)
│   ├── useFeatureLogic.ts
│   └── useFeatureState.ts
├── utils/                        # Feature utilities
│   ├── formatFeature.ts
│   ├── formatFeature.test.ts
│   └── validateFeature.ts
├── __tests__/                    # Integration tests (optional)
│   └── FeatureFlow.test.tsx
├── Page.tsx                      # Main page component
├── Router.tsx                    # Feature routes
├── paths.ts                      # Route paths
├── types.ts                      # Shared types
├── constants.ts                  # Constants
└── README.md                     # Feature documentation (optional)
```

## Naming Conventions

- Components: `PascalCase.tsx` (`UserProfile.tsx`)
- Hooks: `camelCase.ts` (`useUserProfile.ts`)
- Utils: `camelCase.ts` (`formatDate.ts`)
- Types: `camelCase.types.ts` (`user.types.ts`)
- Tests: `ComponentName.test.tsx`
