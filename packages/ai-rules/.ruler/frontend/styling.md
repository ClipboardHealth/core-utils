# Styling

## Core Rules

1. **Always use `sx` prop**—never CSS/SCSS/SASS/styled()/makeStyles()
2. **Use theme tokens**—never hardcode colors/spacing
3. **Type-safe theme access**—use `sx={(theme) => ({...})}`
4. **Use semantic token names**—`theme.palette.text.primary`, not `common.white`

## Patterns

```typescript
// ✅ Correct
<Box sx={(theme) => ({
  backgroundColor: theme.palette.background.primary,
  color: theme.palette.text.secondary,
  padding: theme.spacing(4), // or just: padding: 4
})} />

// ❌ Wrong
<Box sx={{
  backgroundColor: "red",      // raw color
  padding: "16px",             // raw size
  color: "text.secondary",     // string path (not type-safe)
}} />
```

## Spacing

Use theme spacing indices 1-12:

```typescript
<Box sx={{ padding: 5 }} />
<Box sx={{ marginX: 4 }} />
```

Use `rem` for fonts/heights (scales with user zoom), spacing indices for padding/margin.

## Property Names

- ✅ Use full names: `padding`, `paddingX`, `marginY`
- ❌ Avoid abbreviations: `p`, `px`, `my`

## Pseudo-classes

```typescript
<Box sx={(theme) => ({
  "&:hover": { backgroundColor: theme.palette.primary.dark },
  "&:disabled": { opacity: 0.5 },
  "& .MuiTypography-root": { color: theme.palette.text.secondary },
})} />
```
