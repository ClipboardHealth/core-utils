# Styling Standards

## Technology Stack

- **Material UI (MUI)** via `@clipboard-health/ui-theme`
- **sx prop** for custom styles (NOT `styled()`)
- Custom component wrappers in `redesign/components/`
- **Storybook** as single source of truth for UI components

## Core Principles

1. **Always use `sx` prop** - Never CSS/SCSS/SASS files
2. **Use theme tokens** - Never hardcode colors, spacing, or sizes
3. **Leverage meaningful tokens** - Use semantic names like `theme.palette.text.primary`, not `common.white`
4. **Type-safe theme access** - Use `sx={(theme) => ({...})}`, not string paths like `"text.secondary"`
5. **Follow spacing system** - Use indices 1-12 (4px-64px)
6. **Storybook is source of truth** - Check Storybook before Figma

## Restricted Patterns

### ❌ DO NOT USE

- `styled()` from MUI (deprecated in our codebase)
- `makeStyles()` from MUI (deprecated)
- CSS/SCSS/SASS files
- Direct MUI icons from `@mui/icons-material`
- Direct MUI components without wrappers (see list below)
- Inline styles via `style` prop (use `sx` instead)
- String paths for theme tokens (not type-safe)

### Rationale

```javascript
// From .eslintrcRestrictedImports.js
message: `1. Many of the MUI components have our own wrappers in the "components" directory. Use them instead of the MUI components.
   2. Instead of deprecated \`styled\`, use \`sx\` prop to define custom styles that have access to themes. See guidelines: https://mui.com/system/getting-started/the-sx-prop/.
   3. Don't use Modal, use BottomSheet or FullScreenDialog. Don't use DialogTitle as we don't have a single appearance for all dialogs.`;
```

## Storybook as Source of Truth

**Important:** Storybook reflects what's actually implemented, not Figma designs.

### When Storybook Differs from Figma

1. **Check Storybook first** - It shows real, implemented components
2. **Use closest existing variant** - Don't create one-off font sizes/colors
3. **Confirm changes are intentional** - Ask PM or `@frontend` before updating components
4. **Create follow-up ticket** - If component needs updating but you're short on time
5. **Make changes system-wide** - Component updates should benefit entire app

### Process

- **Minor differences** (font sizes, colors) → Stick to Storybook
- **Component looks different** → Confirm with PM, update component intentionally
- **Missing component** → Ask `@frontend` - it may exist with a different name

## Use Internal Components

### ✅ ALWAYS USE Our Wrappers

Instead of importing directly from `@mui/material`, use our wrappers from `@redesign/components`:

```typescript
// ❌ Don't
import { Button, IconButton } from "@mui/material";

// ✅ Do
import { Button } from "@redesign/components/Button";
import { IconButton } from "@redesign/components/IconButton";
```

### Component Wrapper List

Use wrappers instead of direct MUI imports for:

- `Button`, `LoadingButton`, `IconButton`
- `Avatar`, `Accordion`, `Badge`
- `Card`, `Chip`, `Dialog`
- `Drawer`, `List`, `ListItem`
- `Rating`, `Slider`, `Switch`
- `TextField`, `Typography`, `Tab`, `Tabs`

Full restricted list in `.eslintrcRestrictedImports.js`

## Icons

### Use CbhIcon

```typescript
// ❌ Don't use MUI icons
import SearchIcon from '@mui/icons-material/Search';

// ✅ Use CbhIcon
import { CbhIcon } from '@clipboard-health/ui-components';

<CbhIcon type="search" size="large" />
<CbhIcon type="search-colored" size="medium" />
```

### Icon Variants

- Many icons have `-colored` variants for active states
- Example: `"search"` and `"search-colored"`

## Styling with sx Prop

### Basic Usage - Type-Safe Theme Access

❌ **Never** hardcode values or use string paths:

```typescript
<Box
  sx={{
    backgroundColor: "red", // ❌ Raw color
    color: "#ADFF11", // ❌ Hex code
    padding: "16px", // ❌ Raw size
    color: "text.secondary", // ❌ String path (no TypeScript support)
  }}
/>
```

✅ **Always** use theme with type safety:

```typescript
<Box
  sx={(theme) => ({
    backgroundColor: theme.palette.background.primary, // ✅ Semantic token
    color: theme.palette.text.secondary, // ✅ Type-safe
    padding: theme.spacing(4), // or just: padding: 4   // ✅ Spacing system
  })}
/>
```

### Use Meaningful Tokens

❌ **Avoid** non-descriptive tokens:

```typescript
theme.palette.common.white; // ❌ No context about usage
theme.palette.green300; // ❌ Which green? When to use?
```

✅ **Use** semantic tokens:

```typescript
theme.palette.background.tertiary; // ✅ Clear purpose
theme.palette.instantPay.background; // ✅ Intent is obvious
theme.palette.text.primary; // ✅ Meaningful
```

## Spacing System

We use a strict index-based spacing system:

| Index | 1   | 2   | 3   | 4    | 5    | 6    | 7    | 8    | 9    | 10   | 11   | 12   |
| ----- | --- | --- | --- | ---- | ---- | ---- | ---- | ---- | ---- | ---- | ---- | ---- |
| Size  | 4px | 6px | 8px | 12px | 16px | 20px | 24px | 32px | 40px | 48px | 56px | 64px |

**Usage:**

```typescript
<Box sx={{ padding: 5 }} />    // → 16px
<Box sx={{ marginX: 4 }} />    // → 12px left and right
<Box sx={{ gap: 3 }} />        // → 8px
```

**Use `rem` for fonts and heights:**

```typescript
<Box
  sx={(theme) => ({
    height: "3rem", // ✅ Scales with user zoom
    fontSize: theme.typography.body1.fontSize, // ✅ From theme
    padding: 5, // ✅ px prevents overflow when zoomed
  })}
/>
```

**Reasoning:** Users who adjust device-wide zoom need `rem` for fonts/heights to scale properly, but `px` spacing prevents layout overflow.

## Theme Integration

### Responsive Styles

```typescript
<Box
  sx={{
    width: {
      xs: "100%", // Mobile
      sm: "75%", // Tablet
      md: "50%", // Desktop
    },
    padding: {
      xs: 1,
      md: 3,
    },
  }}
/>
```

### Pseudo-classes and Hover States

```typescript
<Box
  sx={{
    "&:hover": {
      backgroundColor: "primary.dark",
      cursor: "pointer",
    },
    "&:disabled": {
      opacity: 0.5,
    },
    "&.active": {
      borderColor: "primary.main",
    },
  }}
/>
```

### Nested Selectors

```typescript
<Box
  sx={{
    "& .child-element": {
      color: "text.secondary",
    },
    "& > div": {
      marginBottom: 1,
    },
    // Target nested MUI components
    "& .MuiTypography-root": {
      color: theme.palette.intent?.disabled.text,
    },
  }}
/>
```

## Shorthand Properties

MUI provides shorthand properties - use full names, not abbreviations:

✅ **Use full names:**

```typescript
<Box
  sx={{
    padding: 2, // ✅ Clear
    paddingX: 4, // ✅ Readable
    marginY: 2, // ✅ Explicit
  }}
/>
```

❌ **Avoid abbreviations** (per naming conventions best practice):

```typescript
<Box
  sx={{
    p: 2, // ❌ Too terse
    px: 4, // ❌ Not clear
    my: 2, // ❌ What does this mean?
  }}
/>
```

[Full list of shorthand properties](https://mui.com/system/properties/)

## mergeSxProps Utility

For generic components accepting an `sx` prop, use `mergeSxProps` to combine default styles with custom styles:

```typescript
import { mergeSxProps } from "@clipboard-health/ui-react";

<Box
  sx={mergeSxProps(
    (theme) => ({
      backgroundColor: theme.palette.background.tertiary,
      padding: 2,
    }),
    sx // User's custom sx prop
  )}
  {...restProps}
/>;
```

## Theme Access

### Using getTheme

```typescript
import { getTheme } from "@clipboard-health/ui-theme";
import { ThemeProvider } from "@mui/material";

export function Component() {
  const theme = getTheme();

  return <ThemeProvider theme={theme}>{/* Your components */}</ThemeProvider>;
}
```

### Theme Properties

```typescript
const theme = getTheme();

// Colors
theme.palette.primary.main;
theme.palette.secondary.main;
theme.palette.error.main;
theme.palette.text.primary;
theme.palette.background.default;

// Spacing
theme.spacing(1); // 8px
theme.spacing(2); // 16px

// Typography
theme.typography.h1;
theme.typography.body1;

// Breakpoints
theme.breakpoints.up("md");
theme.breakpoints.down("sm");
```

## Modal Patterns

### ❌ Don't Use Modal

```typescript
// Don't
import { Modal } from "@mui/material";
```

### ✅ Use BottomSheet or FullScreenDialog

```typescript
// For mobile-friendly modals
import { BottomSheet } from "@redesign/components/BottomSheet";

// For full-screen views
import { FullScreenDialog } from "@redesign/components/FullScreenDialog";
```

## Layout Components

### Use MUI Layout Components

These are safe to import directly from MUI:

```typescript
import { Box, Stack, Container, Grid } from '@mui/material';

// Stack for vertical/horizontal layouts
<Stack spacing={2} direction="row">
  <Item />
  <Item />
</Stack>

// Box for flexible containers
<Box sx={{ display: 'flex', gap: 2 }}>
  <Child />
</Box>

// Grid for responsive layouts
<Grid container spacing={2}>
  <Grid item xs={12} md={6}>
    <Content />
  </Grid>
</Grid>
```

## MUI Augmentations

### Type Safety

Import MUI theme augmentations to ensure type safety:

```typescript
// At top of file that uses extensive MUI theming
import "@clipboard-health/ui-theme";
import "@clipboard-health/ui-theme/src/lib/colors";
import "@clipboard-health/ui-theme/src/lib/overrides/button";
```

See `muiAugmentations.d.ts` for full list of augmentations.

## Common Patterns

### Card with Custom Styling

```typescript
import { Card, CardContent } from "@mui/material";

<Card
  sx={{
    borderRadius: 2,
    boxShadow: 2,
    "&:hover": {
      boxShadow: 4,
    },
  }}
>
  <CardContent>Content here</CardContent>
</Card>;
```

### Buttons with Theme Colors

```typescript
import { Button } from "@redesign/components/Button";

<Button
  variant="contained"
  color="primary"
  sx={{
    textTransform: "none", // Override uppercase
    fontWeight: "bold",
  }}
>
  Submit
</Button>;
```

### Conditional Styles

```typescript
<Box
  sx={{
    backgroundColor: isActive ? "primary.main" : "grey.200",
    padding: 2,
  }}
>
  {content}
</Box>
```

## Best Practices

- **Check Storybook first** - It's the single source of truth
- **Use theme tokens** - Never hardcode colors/spacing
- **Type-safe access** - Function form: `sx={(theme) => ({...})}`
- **Meaningful tokens** - Semantic names over raw colors
- **Spacing system** - Indices 1-12 (or `theme.spacing(n)`)
- **Use shorthand props** - `paddingX`, `marginY` (full names, not `px`, `my`)
- **Leverage pseudo-classes** - For hover, focus, disabled states
- **Prefer `sx` over direct props** - `sx` takes priority and is more flexible
