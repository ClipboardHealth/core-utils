# File Organization

Organize frontend code by concept/feature (e.g., `Shifts/`, `Invites/`), not by type (e.g., `components/`, `hooks/`).

```text
FeatureName/
├── api/                    # Data fetching hooks
│   └── useGetFeature.ts
├── components/             # Feature-specific components
│   └── FeatureCard.tsx
├── hooks/                  # Non-API hooks
│   └── useFeatureLogic.ts
├── utils/                  # Utilities + tests
│   ├── formatFeature.ts
│   └── formatFeature.test.ts
├── Page.tsx                # Main page
├── Router.tsx              # Routes
├── paths.ts                # Route constants
└── types.ts                # Shared types
```

## Naming

- Components: `PascalCase.tsx`
- Hooks: `camelCase.ts` (prefixed with `use`)
- Utils: `camelCase.ts`
- Tests: `*.test.tsx`
