# Component Patterns

## Core Principles

1. **One file per component** - Never extract JSX into local variables
2. **Composition over configuration** - Prefer `children` over many props
3. **Pass primitives** - Not entire API response objects
4. **Use existing components** - Check component library before creating new ones
5. **Feature-specific first** - Only move to shared after 3+ uses

**Why?** Keeping components focused and reusable makes them easier to test, maintain, and compose into complex UIs.

## Component Naming

- **Components**: `PascalCase.tsx` (e.g., `UserCard.tsx`)
- **Hooks**: `camelCase.ts` with `use` prefix (e.g., `useUserData.ts`)
- **Utils**: `camelCase.ts` (e.g., `formatUser.ts`)
- **Event handlers**: `handle*` (e.g., `handleClick`, `handleSubmit`)

## When to Create What

### Create Feature-Specific Component

```
When:
- Component is only used within one feature
- Component contains feature-specific logic
- Not reusable across features yet

Where:
FeatureName/components/ComponentName.tsx
```

### Create Shared Component

```
When:
- Component is used in 3+ different features
- Component is generic and reusable
- No feature-specific logic

Where:
src/appV2/redesign/components/ComponentName.tsx
```

## Component Structure

```typescript
// 1. Imports (grouped: external, internal, types)
import { useState, useCallback } from "react";
import { Box, Stack } from "@mui/material";
import { Button } from "@/components/Button";

// 2. Types (co-located interfaces)
interface Props {
  userId: string;
  onUpdate: (data: UpdateData) => void;
}

// 3. Component
export function UserCard({ userId, onUpdate }: Props) {
  // 3a. Hooks (queries, state, effects)
  const { data, isLoading } = useGetUser(userId);
  const [isEditing, setIsEditing] = useState(false);

  // 3b. Derived state (no useMemo for cheap operations)
  const displayName = formatName(data);

  // 3c. Event handlers
  const handleSave = useCallback(async (formData: FormData) => {
    await onUpdate(formData);
    setIsEditing(false);
  }, [onUpdate]);

  // 3d. Early returns for loading/error/empty
  if (isLoading) return <LoadingState />;
  if (!data) return <NotFoundState />;

  // 3e. Main render
  return (
    <Card>
      <CardHeader title={displayName} />
      <CardContent>
        {/* Component content */}
      </CardContent>
    </Card>
  );
}
```

## Pass Primitives, Not Objects

```typescript
// ❌ WRONG: Passing entire API response
interface Props {
  shift: ShiftApiResponse;  // Couples to API shape
}

function ShiftCard({ shift }: Props) {
  return <Text>{shift.workplace.name}</Text>;
}
```

```typescript
// ✅ CORRECT: Pass only what's needed
interface Props {
  shiftId: string;
  workplaceName: string;
  startTime: Date;
  payAmount: number;
}

function ShiftCard({ shiftId, workplaceName, startTime, payAmount }: Props) {
  return <Text>{workplaceName}</Text>;
}
```

**Why?** Views become reusable, testable, and decoupled from API changes.

## One File Per Component

```typescript
// ❌ WRONG: Extracting JSX to variables
function Component() {
  const header = <Header title="Title" />;
  const content = <p>Content</p>;

  return <>{header}{content}</>;
}
```

```typescript
// ✅ CORRECT: Keep inline or extract to new file
function Component() {
  return (
    <>
      <Header title="Title" />
      <p>Content</p>
    </>
  );
}

// Or extract to ComponentHeader.tsx for complexity
```

## Composition Over Configuration

```typescript
// ❌ WRONG: Too many props
interface Props {
  showHeader?: boolean;
  showFooter?: boolean;
  headerText?: string;
  footerText?: string;
}
```

```typescript
// ✅ CORRECT: Use children and slots
interface Props {
  header?: ReactNode;
  footer?: ReactNode;
  children: ReactNode;
}

function Card({ header, footer, children }: Props) {
  return (
    <Box>
      {header && <CardHeader>{header}</CardHeader>}
      <CardContent>{children}</CardContent>
      {footer && <CardFooter>{footer}</CardFooter>}
    </Box>
  );
}

// Usage
<Card
  header={<Title>My Title</Title>}
  footer={<Button>Action</Button>}
>
  <Text>Content</Text>
</Card>
```

## Shared Component Library

Common components available in `src/appV2/redesign/components/`:

### Layout Components
- **Box, Stack, Container** - Layout primitives (from MUI)
- **Card** - Container for content with elevation
- **Divider** - Visual separator

### Typography
- **Title** - Headings (h1-h6 variants)
- **Text** - Body text with variants (body1, body2, caption)

### Actions
- **Button** - All button variants (primary, secondary, outlined, link, etc.)
- **IconButton** - Icon-only buttons
- **Link** - Navigation links

### Display
- **Badge** - Status indicators
- **Pill** - Small status labels
- **Tag** - Categorization labels
- **Avatar** - User/entity avatars
- **Icon** - 100+ Material Design icons

### Input
- **TextField** - Text input with validation
- **Select** - Dropdown selection
- **Checkbox, Radio, Switch** - Boolean/multi-select inputs
- **DatePicker, TimePicker** - Date/time selection

### Feedback
- **Modal** - Dialogs and modals
- **Drawer** - Side panels
- **BottomSheet** - Mobile-optimized modals
- **Toast** - Temporary notifications
- **Loading** - Loading indicators

### Data Display
- **DataGrid** - Tables with sorting/filtering
- **Tabs** - Tab navigation
- **Timeline** - Chronological event display
- **MetricCard** - Metric display with trend indicators

## Using Custom Wrappers

Always use project wrappers instead of MUI directly:

```typescript
// ❌ WRONG: Importing from MUI directly
import { Button, IconButton } from "@mui/material";

// ✅ CORRECT: Use project wrappers
import { Button } from "@/components/Button";
import { IconButton } from "@clipboard-health/ui-components";
```

**Why?** Wrappers provide consistent behavior, accessibility, and app-specific functionality.

## Responsive Components

Use responsive hooks instead of hardcoded breakpoints:

```typescript
import { useIsMobile } from "@/hooks/useResponsive";

export function ResponsiveComponent() {
  const isMobile = useIsMobile();

  return isMobile ? (
    <MobileView />
  ) : (
    <DesktopView />
  );
}
```

## Component Testing

Test components as users interact with them:

```typescript
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MockAppWrapper } from "@src/appV2/mocks/MockAppWrapper";

it("should handle button click", async () => {
  const user = userEvent.setup();
  const onUpdate = vi.fn();

  render(<UserCard userId="123" onUpdate={onUpdate} />, {
    wrapper: MockAppWrapper,
  });

  await user.click(screen.getByRole("button", { name: "Update" }));

  expect(onUpdate).toHaveBeenCalled();
});
```

## Complete Component Reference

This guide covers essential component patterns. For comprehensive details including:

- Complete component library inventory (30+ components)
- Component-specific usage guidelines
- Props interfaces and examples
- Storybook documentation links

**See your repo's documentation:**
- `src/appV2/redesign/docs/COMPONENT_LIBRARY.md` - Complete component inventory
- `src/appV2/redesign/CLAUDE.md` - Quick component decision tree
