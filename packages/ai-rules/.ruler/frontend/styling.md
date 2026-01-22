# Styling Standards

## Core Principles

1. **Always use `sx` prop** - Never CSS/SCSS/SASS/styled()/makeStyles()
2. **Always use theme tokens** - Never hardcode colors, spacing, or sizes
3. **Type-safe theme access** - Use `sx={(theme) => ({...})}`, not string paths
4. **Semantic token names** - Use `theme.palette.text.primary`, not `common.white`
5. **Follow spacing system** - Use indices or theme.spacing()

**Why?** Theme tokens ensure consistency, enable theme switching, and provide compile-time safety. The `sx` prop integrates directly with MUI's theme system.

## The Golden Rules

### ✅ ALWAYS Do This

```typescript
// Use sx prop with theme function for type safety
<Box sx={(theme) => ({
  backgroundColor: theme.palette.background.primary,
  color: theme.palette.text.secondary,
  padding: theme.spacing(5),  // or just: padding: 5
  borderRadius: theme.borderRadius.medium,
})} />
```

### ❌ NEVER Do This

```typescript
// Raw color values
<Box sx={{ backgroundColor: "#17181E", color: "#FFFFFF" }} />

// Raw spacing values
<Box sx={{ padding: "20px", margin: "10px 15px" }} />

// String paths (not type-safe)
<Box sx={{ color: "text.secondary" }} />  // No TypeScript support!

// makeStyles, styled(), CSS files
const useStyles = makeStyles((theme) => ({ ... }));  // Deprecated
const StyledBox = styled(Box)({ ... });  // Don't use
```

## Before/After Anti-Patterns

### Colors

```typescript
// ❌ WRONG: Raw hex values
<Box sx={{
  backgroundColor: "#FFFFFF",
  color: "#17181E",
  borderColor: "#E5E5E5"
}} />

// ✅ CORRECT: Theme tokens with semantic names
<Box sx={(theme) => ({
  backgroundColor: theme.palette.background.standout,
  color: theme.palette.base.strong,
  borderColor: theme.palette.border.base
})} />
```

### Spacing

```typescript
// ❌ WRONG: Raw pixel/rem values
<Box sx={{
  padding: "20px",
  marginX: "15px",
  gap: "8px"
}} />

// ✅ CORRECT: Theme spacing
<Box sx={(theme) => ({
  padding: theme.spacing(5),  // 20px
  marginX: theme.spacing(4),  // 15px
  gap: theme.spacing(3)       // 8px
})} />

// ✅ ALSO CORRECT: Shorthand (when not using theme function for other props)
<Box sx={{
  padding: 5,
  marginX: 4,
  gap: 3
}} />
```

### Responsive Design

```typescript
// ❌ WRONG: Hardcoded breakpoints
<Box sx={{
  "@media (max-width: 640px)": { display: "none" }
}} />

// ✅ CORRECT: Use responsive hooks
const isMobile = useIsMobile();
return isMobile ? <MobileView /> : <DesktopView />;

// ✅ ALSO CORRECT: Responsive sx values
<Box sx={{
  width: {
    xs: "100%",  // Mobile
    md: "50%"    // Desktop
  }
}} />
```

## Quick Reference: Essential Theme Tokens

These are the most commonly used tokens. See your repo's THEME.md for complete reference.

### Colors

```typescript
// Text colors
theme.palette.base.strong          // Primary text (darkest)
theme.palette.base.muted           // Secondary text (lighter)
theme.palette.base.inverted.base   // Text on dark backgrounds

// Background colors
theme.palette.background.standout  // Card/elevated surfaces
theme.palette.background.default   // Page background
theme.palette.background.tertiary  // Subtle backgrounds

// Border colors
theme.palette.border.base          // Standard borders
theme.palette.border.subtle        // Lighter borders

// Semantic colors
theme.palette.error.main           // Error states
theme.palette.success.main         // Success states
theme.palette.warning.main         // Warning states
```

### Spacing Scale

```typescript
// Common spacing values
theme.spacing(1)  // 4px  - Tiny gaps
theme.spacing(2)  // 8px  - Small gaps
theme.spacing(3)  // 12px - Medium gaps
theme.spacing(4)  // 15px - Standard gaps
theme.spacing(5)  // 20px - Large gaps, card padding
theme.spacing(6)  // 30px - Section spacing
```

### Border Radius

```typescript
theme.borderRadius.small   // 6px  - Subtle rounding
theme.borderRadius.medium  // 8px  - Standard components
theme.borderRadius.large   // 12px - Cards, prominent elements
```

## Common Patterns

### Basic Box with Theme Styling

```typescript
<Box sx={(theme) => ({
  backgroundColor: theme.palette.background.standout,
  padding: theme.spacing(5),
  borderRadius: theme.borderRadius.medium,
  border: `1px solid ${theme.palette.border.base}`
})} />
```

### Hover States

```typescript
<Box sx={(theme) => ({
  backgroundColor: theme.palette.background.default,
  "&:hover": {
    backgroundColor: theme.palette.background.standout,
    cursor: "pointer"
  }
})} />
```

### Nested Selectors

```typescript
<Box sx={(theme) => ({
  "& .MuiTypography-root": {
    color: theme.palette.text.secondary
  },
  "& > div": {
    marginBottom: theme.spacing(2)
  }
})} />
```

## mergeSxProps Pattern

For components accepting custom `sx` prop, merge with default styles:

```typescript
interface Props {
  sx?: SxProps<Theme>;
}

export function CustomCard({ sx, ...props }: Props) {
  return (
    <Box
      sx={[
        (theme) => ({
          backgroundColor: theme.palette.background.standout,
          padding: theme.spacing(4),
          borderRadius: theme.borderRadius.medium
        }),
        ...(Array.isArray(sx) ? sx : [sx])  // Merge user's sx
      ]}
      {...props}
    />
  );
}
```

## Responsive Design

### Using Breakpoint Values

```typescript
<Box sx={{
  width: {
    xs: "100%",    // Mobile
    sm: "75%",     // Tablet
    md: "50%"      // Desktop
  },
  padding: {
    xs: 2,
    md: 5
  }
}} />
```

### Using Responsive Hooks

```typescript
import { useIsMobile } from "@/hooks/useResponsive";

export function ResponsiveComponent() {
  const isMobile = useIsMobile();

  return isMobile ? (
    <MobileLayout />
  ) : (
    <DesktopLayout />
  );
}
```

## Spacing Guidelines

### Use `rem` for Fonts and Heights

```typescript
<Box sx={(theme) => ({
  height: "3rem",     // ✅ Scales with user zoom
  fontSize: "1rem",   // ✅ Accessible
  padding: 5          // ✅ px prevents overflow when zoomed
})} />
```

**Why?** Users who adjust device-wide zoom need `rem` for fonts/heights to scale properly, but `px` spacing prevents layout overflow.

## Property Names: Full Names, Not Abbreviations

```typescript
// ✅ CORRECT: Full property names
<Box sx={{
  padding: 2,
  paddingX: 4,
  marginY: 2
}} />

// ❌ WRONG: Abbreviations
<Box sx={{
  p: 2,    // Too terse
  px: 4,   // Not clear
  my: 2    // What does this mean?
}} />
```

## Complete Theme Reference

This guide covers the most essential tokens for day-to-day development. For the complete theme specification including:

- Full color palette with all semantic tokens
- Complete spacing scale
- Typography scale (font sizes, weights, line heights)
- Shadow tokens for elevation
- Platform-specific interaction patterns

**See your repo's documentation:**
- `src/appV2/redesign/docs/THEME.md` - Complete theme reference
- `src/appV2/redesign/CLAUDE.md` - Quick styling decision tree
