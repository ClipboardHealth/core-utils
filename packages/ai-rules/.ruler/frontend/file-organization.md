# File Organization Standards

## Feature-Based Structure

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

## File Naming Conventions

### React Components

- **PascalCase** for all React components
- Examples: `Button.tsx`, `UserProfile.tsx`, `ShiftCard.tsx`

### Avoid Path Stuttering

Don't repeat directory names in file names - the full path provides enough context:

❌ **Bad** - Path stuttering:

```text
Shift/
  ShiftInvites/
    ShiftInviteCard.tsx      // ❌ "Shift" repeated 3 times in path
    ShiftInviteList.tsx      // ❌ Import: Shift/ShiftInvites/ShiftInviteCard
```

✅ **Good** - Clean, concise:

```text
Shift/
  Invites/
    Card.tsx                 // ✅ Path: Shift/Invites/Card
    List.tsx                 // ✅ Import: Shift/Invites/List
```

**Reasoning:**

- The full path already provides context (`Shift/Invites/Card` is clear)
- Repeating names makes imports verbose: `import { ShiftInviteCard } from 'Shift/ShiftInvites/ShiftInviteCard'`
- Shorter names are easier to work with in the editor

### Utilities and Hooks

- **camelCase** for utilities, hooks, and non-component files
- Examples: `formatDate.ts`, `useAuth.ts`, `calculateTotal.ts`

### Multi-word Non-Components

- **camelCase** for multi-word utility and configuration files
- Examples: `userProfileUtils.ts`, `apiHelpers.ts`

### Test Files

- Co-locate with source: `Button.test.tsx` next to `Button.tsx`
- Test folder: `__tests__/` for integration tests
- Pattern: `*.test.ts` or `*.test.tsx`

### Constants and Types

- `types.ts` - Shared types for the feature
- `constants.ts` - Feature constants
- `paths.ts` - Route path constants

## Import Organization

### Import Order

```typescript
// 1. External dependencies (React, third-party)
import { useState, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { parseISO, format } from "date-fns";

// 2. Internal packages (@clipboard-health, @src)
import { Button } from "@clipboard-health/ui-components";
import { CbhIcon } from "@clipboard-health/ui-components";
import { formatDate } from "@src/appV2/lib/dates";
import { useDefinedWorker } from "@src/appV2/Worker/useDefinedWorker";

// 3. Relative imports (same feature)
import { useFeatureData } from "./hooks/useFeatureData";
import { FeatureCard } from "./components/FeatureCard";
import { FEATURE_PATHS } from "./paths";
import { type FeatureData } from "./types";
```

### Import Grouping Rules

- Add blank lines between groups
- Sort alphabetically within each group (optional but recommended)
- Group type imports with their module: `import { type User } from './types'`

## Path Management

### Defining Paths

```typescript
// paths.ts
import { APP_PATHS } from "@/constants/paths";

export const FEATURE_BASE_PATH = "feature";
export const FEATURE_FULL_PATH = `${APP_PATHS.APP_V2_HOME}/${FEATURE_BASE_PATH}`;
export const FEATURE_PATHS = {
  ROOT: FEATURE_FULL_PATH,
  DETAILS: `${FEATURE_FULL_PATH}/:id`,
  EDIT: `${FEATURE_FULL_PATH}/:id/edit`,
  CREATE: `${FEATURE_FULL_PATH}/create`,
} as const;
```

### Using Paths

```typescript
import { useHistory } from "react-router-dom";
import { FEATURE_PATHS } from "./paths";

// Navigation
history.push(FEATURE_PATHS.DETAILS.replace(":id", featureId));

// Route definition
<Route path={FEATURE_PATHS.DETAILS} component={FeatureDetailsPage} />;
```

## Types and Interfaces

### Separate vs Co-located Types

```typescript
// Option 1: Separate types.ts for shared types
// types.ts
export interface Feature {
  id: string;
  name: string;
}

export type FeatureStatus = "active" | "inactive";

// Option 2: Co-located with component for component-specific types
// FeatureCard.tsx
interface FeatureCardProps {
  feature: Feature;
  onSelect: (id: string) => void;
}

export function FeatureCard(props: FeatureCardProps) {
  // ...
}
```

## Constants

### Defining Constants

```typescript
// constants.ts
export const FEATURE_STATUS = {
  ACTIVE: "active",
  INACTIVE: "inactive",
  PENDING: "pending",
} as const;

export type FeatureStatus = (typeof FEATURE_STATUS)[keyof typeof FEATURE_STATUS];

export const MAX_ITEMS = 100;
export const DEFAULT_PAGE_SIZE = 20;

export const FEATURE_EVENTS = {
  VIEWED: "FEATURE_VIEWED",
  CREATED: "FEATURE_CREATED",
  UPDATED: "FEATURE_UPDATED",
} as const;
```

## Folder Depth Guidelines

- **Maximum 3 levels deep** for feature folders
- For deeper nesting, consider splitting into separate features
- Use meaningful folder names that describe the content

```text
Good:
├── Shift/
│   ├── Calendar/
│   │   └── ShiftCalendarCore.tsx
│   └── Card/
│       └── ShiftCard.tsx

Avoid:
├── Shift/
│   ├── Components/
│   │   ├── Display/
│   │   │   ├── Calendar/
│   │   │   │   └── Core/
│   │   │   │       └── ShiftCalendarCore.tsx  # Too deep!
```

## Module Exports

### Index Files

Avoid using `index.ts` files in the redesign folder. Prefer explicit imports.

```typescript
// Avoid
// index.ts
export * from "./Button";
export * from "./Card";

// Prefer explicit imports
import { Button } from "@/components/Button";
import { Card } from "@/components/Card";
```

### Named Exports

Always use named exports (not default exports) in redesign code.

```typescript
// Good
export function Button(props: ButtonProps) {}

// Avoid
export default function Button(props: ButtonProps) {}
```

## API Folder Structure

```text
api/
├── useGetFeatures.ts          # GET requests
├── useCreateFeature.ts        # POST requests
├── useUpdateFeature.ts        # PUT/PATCH requests
├── useDeleteFeature.ts        # DELETE requests
└── schemas.ts                 # Zod schemas (optional)
```

## Utils Folder Guidelines

- Keep utilities pure functions when possible
- Co-locate tests with utilities
- Export individual functions (not as objects)

```typescript
// Good
// utils/formatFeatureName.ts
export function formatFeatureName(name: string): string {
  return name.trim().toUpperCase();
}

// utils/formatFeatureName.test.ts
import { formatFeatureName } from "./formatFeatureName";

describe("formatFeatureName", () => {
  it("should format name correctly", () => {
    expect(formatFeatureName("  test  ")).toBe("TEST");
  });
});
```
