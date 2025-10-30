# Styling Standards

## Core Principles

1. **Always use `sx` prop** - Never CSS/SCSS/SASS files
2. **Use theme tokens** - Never hardcode colors/spacing
3. **Type-safe theme access** - Use `sx={(theme) => ({...})}`
4. **Use semantic names** - `theme.palette.text.primary`, not `common.white`
5. **Check Storybook first** - It's the single source of truth

## Restricted Patterns

❌ **DO NOT USE:**

- `styled()` or `makeStyles()` from MUI
- CSS/SCSS/SASS files
- Inline `style` prop (use `sx` instead)
- String paths for theme (`"text.secondary"` - not type-safe)

## Type-Safe Theme Access

```typescript
// ✅ Always use function form for type safety
<Box sx={(theme) => ({
  backgroundColor: theme.palette.background.primary,
  color: theme.palette.text.secondary,
  padding: theme.spacing(4), // or just: 4
})} />

// ❌ Never hardcode
<Box sx={{
  backgroundColor: "red", // ❌ Raw color
  padding: "16px", // ❌ Raw size
  color: "text.secondary", // ❌ String path
}} />
```

## Spacing System

Use indices 1-12 (4px-64px):

```typescript
<Box sx={{ padding: 5 }} />    // → 16px
<Box sx={{ marginX: 4 }} />    // → 12px left and right
<Box sx={{ gap: 3 }} />        // → 8px
```

**Use `rem` for fonts/heights (scales with user zoom), `px` for spacing:**

```typescript
<Box sx={(theme) => ({
  height: "3rem", // ✅ Scales
  fontSize: theme.typography.body1.fontSize,
  padding: 5, // ✅ Prevents overflow
})} />
```

## Responsive Styles

```typescript
<Box sx={{
  width: { xs: "100%", md: "50%" },
  padding: { xs: 1, md: 3 },
}} />
```

## Pseudo-classes

```typescript
<Box sx={(theme) => ({
  "&:hover": { backgroundColor: theme.palette.primary.dark },
  "&:disabled": { opacity: 0.5 },
  "& .child": { color: theme.palette.text.secondary },
})} />
```

## Shorthand Properties

✅ Use full names: `padding`, `paddingX`, `marginY`
❌ Avoid abbreviations: `p`, `px`, `my`

## Layout Components

Safe to import directly from MUI:

```typescript
import { Box, Stack, Container, Grid } from "@mui/material";
```

## Best Practices

- Type-safe access with `sx={(theme) => ({...})}`
- Use semantic token names
- Full property names, not abbreviations
