---
description: "Frontend architecture: technology stack, file organization, where business logic lives"
---

# Frontend Architecture

## Technology Stack

- **React** with TypeScript (strict mode)
- **MUI** for UI components
- **React Query** (@tanstack/react-query) for data fetching
- **Zod** for runtime validation
- **Vitest** + **@testing-library/react** for testing
- **MSW** for API mocking
- **Playwright** for E2E tests
- **constate** for shared state

## File Organization

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

## Business Logic Placement

Flag business logic in frontend code that should be a backend API call instead. Frontend/backend divergence causes bugs.
