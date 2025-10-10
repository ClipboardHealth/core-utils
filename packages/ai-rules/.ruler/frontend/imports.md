# Import Standards

## Component Wrapper Pattern

Many projects wrap third-party UI library components to add app-specific functionality. This can be enforced via ESLint rules.

## Restricted MUI Imports

### ❌ Component Restrictions (Example)

Some projects restrict direct imports of certain components from `@mui/material`:

```typescript
// ❌ Forbidden
import {
  Avatar,
  Accordion,
  AccordionDetails,
  AccordionSummary,
  Badge,
  Button,
  Card,
  Chip,
  Dialog,
  DialogTitle,
  Divider,
  Drawer,
  FilledInput,
  Icon,
  IconButton,
  InputBase,
  List,
  ListItem,
  ListItemButton,
  ListItemIcon,
  ListItemText,
  Modal,
  OutlinedInput,
  Rating,
  Slider,
  TextField,
  Typography,
  Tab,
  Tabs,
  SvgIcon,
} from "@mui/material";
```

### ✅ Use Internal Wrappers

```typescript
// ✅ Correct - Use project wrappers
import { Button } from "@clipboard-health/ui-components/Button";
import { IconButton } from "@clipboard-health/ui-components/IconButton";
import { LoadingButton } from "@clipboard-health/ui-components/LoadingButton";
```

### Rationale

1. Wrappers provide app-specific functionality and consistent behavior
2. Use `sx` prop for custom styles with theme access
3. Prefer app-specific dialog components over generic Modal components

## Icon Restrictions

### ❌ Third-Party Icons (Example)

```typescript
// ❌ Avoid direct imports from icon libraries
import SearchIcon from "@mui/icons-material/Search";
import CloseIcon from "@mui/icons-material/Close";
import AddIcon from "@mui/icons-material/Add";
```

### ✅ Use Project Icon Component

```typescript
// ✅ Correct - Use project's icon system
import { Icon } from '@clipboard-health/ui-components';

<Icon type="search" size="large" />
<Icon type="close" size="medium" />
<Icon type="plus" size="small" />
```

Many projects maintain their own icon system for consistency and customization.

## Allowed MUI Imports

### ✅ Safe to Import from MUI

These components can be imported directly:

```typescript
import {
  Box,
  Stack,
  Container,
  Grid,
  Paper,
  Skeleton,
  CircularProgress,
  LinearProgress,
  BottomNavigation,
  BottomNavigationAction,
  ThemeProvider,
  useTheme,
  useMediaQuery,
} from "@mui/material";
```

Layout and utility components are generally safe.

## Path Aliases

### Use @ Prefix for Absolute Imports

```typescript
// ✅ Use path aliases configured in tsconfig
import { formatDate } from "@/lib/dates";
import { useUser } from "@/features/user/hooks/useUser";
import { Button } from "@clipboard-health/ui-components/Button";
import { theme } from "@/theme";

// ❌ Avoid relative paths to distant folders
import { formatDate } from "../../../lib/dates";
```

### Relative Imports for Same Feature

```typescript
// ✅ Relative imports within the same feature
import { FeatureCard } from "./components/FeatureCard";
import { useFeatureData } from "./hooks/useFeatureData";
import { FEATURE_PATHS } from "./paths";
import { type FeatureData } from "./types";
```

## Import Grouping

### Standard Order

```typescript
// 1. External dependencies (React, third-party libraries)
import { useState, useEffect, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { parseISO, format } from "date-fns";
import { z } from "zod";

// 2. Internal absolute imports (via path aliases)
import { Button, Icon } from "@clipboard-health/ui-components";
import { theme } from "@/theme";
import { formatDate } from "@/lib/dates";
import { useUser } from "@/features/user/hooks/useUser";
import { APP_PATHS } from "@/constants/paths";

// 3. Relative imports (same feature/module)
import { useFeatureData } from "./hooks/useFeatureData";
import { FeatureCard } from "./components/FeatureCard";
import { FEATURE_PATHS } from "./paths";
import { type FeatureData, type FeatureOptions } from "./types";
```

### Blank Lines Between Groups

- Add blank line between each group
- Helps with readability and organization
- ESLint/Prettier can auto-format this

## Type Imports

### Inline Type Imports

```typescript
// ✅ Preferred: Inline type imports
import { type User, type UserOptions } from "./types";
import { formatUser } from "./utils";
```

### Separate Type Imports

```typescript
// ✅ Also acceptable
import type { User, UserOptions } from "./types";
import { formatUser } from "./utils";
```

## Barrel Exports (index.ts)

### Consider Avoiding Barrel Exports

```typescript
// ❌ Barrel exports can slow build times
// index.ts
export * from "./Button";
export * from "./Card";
```

### ✅ Use Explicit Imports

```typescript
// ✅ Import directly from files for better tree-shaking
import { Button } from "@clipboard-health/ui-components/Button";
import { Card } from "@clipboard-health/ui-components/Card";
```

Note: Barrel exports can cause issues with circular dependencies and slow down builds, especially in large projects.

## Dynamic Imports

### Code Splitting

```typescript
// For large components or routes
const HeavyComponent = lazy(() => import("./HeavyComponent"));

// In component
<Suspense fallback={<Loading />}>
  <HeavyComponent />
</Suspense>;
```

## Common Import Patterns

### API Utilities

```typescript
import { useQuery } from "@/lib/api/hooks";
import { api } from "@/lib/api/client";
```

### React Query

```typescript
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { type UseQueryOptions, type UseQueryResult } from "@tanstack/react-query";
```

### Routing

```typescript
import { useHistory, useLocation, useParams } from "react-router-dom";
import { type LocationState } from "history";
```

### Date Utilities

```typescript
import { parseISO, format, addDays, isBefore } from "date-fns";
```

### Validation

```typescript
import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";
```

## ESLint Configuration

Import restrictions can be enforced with ESLint's `no-restricted-imports` rule:

```javascript
module.exports = {
  rules: {
    "no-restricted-imports": [
      "error",
      {
        paths: [
          {
            name: "@mui/material",
            importNames: ["Button", "TextField", "Dialog"],
            message: "Use wrapper components from @/components",
          },
        ],
        patterns: [
          {
            group: ["@mui/icons-material/*"],
            message: "Use project icon component instead",
          },
        ],
      },
    ],
  },
};
```

## Checking for Violations

```bash
# Lint your code
npm run lint

# Auto-fix import issues
npm run lint:fix
```

## Migration Guide

### When You See Import Errors

1. **Wrapper Component Error**
   - Check if wrapper exists in `@/components/`
   - If yes, import from there
   - If no, discuss with team about creating wrapper

2. **Icon Error**
   - Find equivalent in project icon system
   - Use project's icon component
   - Check available icon names in documentation

3. **Deprecated Pattern Error**
   - Follow the suggested replacement pattern
   - Move to modern alternatives (e.g., `sx` prop instead of `styled`)

## Summary

✅ **DO**:

- Use project wrapper components instead of third-party components directly
- Use project icon system for consistency
- Use path aliases (e.g., `@/`) for absolute imports
- Group imports by external, internal, relative
- Consider avoiding barrel exports for better build performance

❌ **DON'T**:

- Import third-party UI components directly if wrappers exist
- Import icon libraries directly if project has custom icon system
- Use deprecated styling patterns (check project guidelines)
- Use relative imports for distant files
- Create excessive barrel exports that hurt tree-shaking
