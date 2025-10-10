# Import Standards

## Enforced Restrictions

The `@redesign/` folder has strict import rules enforced by ESLint via `.eslintrcRestrictedImports.js`.

## Restricted MUI Imports

### ❌ Component Restrictions

Do NOT import these components directly from `@mui/material`:

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
// ✅ Correct
import { Button } from "@redesign/components/Button";
import { IconButton } from "@redesign/components/IconButton";
import { LoadingButton } from "@redesign/components/LoadingButton";
```

### Error Message

```text
1. Many of the MUI components have our own wrappers in the "components" directory.
   Use them instead of the MUI components.
2. Instead of deprecated `styled`, use `sx` prop to define custom styles that have
   access to themes. See guidelines: https://mui.com/system/getting-started/the-sx-prop/.
3. Don't use Modal, use BottomSheet or FullScreenDialog. Don't use DialogTitle as
   we don't have a single appearance for all dialogs.
```

## Icon Restrictions

### ❌ MUI Icons Forbidden

```typescript
// ❌ Don't use MUI icons
import SearchIcon from "@mui/icons-material/Search";
import CloseIcon from "@mui/icons-material/Close";
import AddIcon from "@mui/icons-material/Add";
```

### ✅ Use CbhIcon

```typescript
// ✅ Correct
import { CbhIcon } from '@clipboard-health/ui-components';

<CbhIcon type="search" size="large" />
<CbhIcon type="close" size="medium" />
<CbhIcon type="plus" size="small" />
```

### Error Message

```text
Do not use mui icons. We have our own icons set,
`import { CbhIcon } from "@clipboard-health/ui-components";`
```

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
// ✅ Use path aliases
import { formatDate } from "@src/appV2/lib/dates";
import { useDefinedWorker } from "@src/appV2/Worker/useDefinedWorker";
import { Button } from "@clipboard-health/ui-components";
import { getTheme } from "@clipboard-health/ui-theme";

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

// 2. Internal packages (@clipboard-health, @src)
import { Button, CbhIcon } from "@clipboard-health/ui-components";
import { getTheme } from "@clipboard-health/ui-theme";
import { formatDate } from "@src/appV2/lib/dates";
import { useDefinedWorker } from "@src/appV2/Worker/useDefinedWorker";
import { RootPaths } from "@src/appV2/App/paths";

// 3. Relative imports (same feature)
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

### ❌ Avoid in Redesign

```typescript
// ❌ Don't create index.ts files
// index.ts
export * from "./Button";
export * from "./Card";
```

### ✅ Use Explicit Imports

```typescript
// ✅ Import directly from files
import { Button } from "@redesign/components/Button";
import { Card } from "@redesign/components/Card";
```

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

### API Hooks

```typescript
import { useGetQuery } from "@src/appV2/lib/api";
import { get, post } from "@src/appV2/lib/api";
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

The restrictions are enforced in `.eslintrcRestrictedImports.js`:

```javascript
module.exports = {
  paths: [
    {
      name: "@mui/material",
      importNames: [...restrictedComponents],
      message: "Use our wrapper components from @redesign/components",
    },
  ],
  patterns: [
    {
      group: ["@mui/icons-material/*"],
      message: "Use CbhIcon from @clipboard-health/ui-components",
    },
  ],
};
```

## Checking for Violations

```bash
# Lint the redesign folder
npm run lint:v2

# Auto-fix import issues
npm run lint:v2:fix
```

## Migration Guide

### When You See Import Errors

1. **MUI Component Error**
   - Check if wrapper exists in `@redesign/components/`
   - If yes, import from there
   - If no, discuss with team about creating wrapper

2. **MUI Icon Error**
   - Find equivalent in CbhIcon types
   - Use `<CbhIcon type="icon-name" />`
   - Check icon names in `@clipboard-health/ui-components`

3. **Deprecated styled() Error**
   - Replace with `sx` prop
   - Move styles inline or to component

## Summary

✅ **DO**:

- Use wrappers from `@redesign/components/`
- Use `CbhIcon` for all icons
- Use `@src` path alias for absolute imports
- Group imports by external, internal, relative
- Use explicit imports (not barrel exports)

❌ **DON'T**:

- Import MUI components directly (use wrappers)
- Import MUI icons (use CbhIcon)
- Use `styled()` or `makeStyles()`
- Use `Modal` (use BottomSheet/FullScreenDialog)
- Create `index.ts` barrel exports in redesign
