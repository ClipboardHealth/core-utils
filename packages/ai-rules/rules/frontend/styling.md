---
description: "Styling components with MUI sx prop: theme tokens, spacing, no CSS/SCSS"
---

# Styling

## Core Rules

1. **Always use `sx` prop**—never CSS/SCSS/SASS/styled()/makeStyles()
2. **Use theme tokens**—never use raw string values for colors/spacing
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

## Dimensions

Always specify explicit `width`/`height`/`minWidth`/`maxWidth`/`minHeight`/`maxHeight` on elements whose layout should not depend on their content's intrinsic size (images, illustrations, fixed cards, skeletons). Use unit choices in this order:

1. **Theme-spacing tokens** (`theme.spacing(n)`) — preferred for any dimension within the spacing scale. The CBH theme uses an **array-based** spacing scale, so `n` is an **index, not a multiplier**:

   | n   | px  |
   | --- | --- |
   | 0   | 0   |
   | 1   | 4   |
   | 2   | 6   |
   | 3   | 8   |
   | 4   | 12  |
   | 5   | 16  |
   | 6   | 20  |
   | 7   | 24  |
   | 8   | 32  |
   | 9   | 40  |
   | 10  | 48  |
   | 11  | 56  |
   | 12  | 64  |

   Indices > 12 are out of range and resolve to `undefined` (which serializes to `0`/empty — usually rendered as `0%`). Max representable size is **64 px**.

2. **`rem`** — for any dimension > 64 px (e.g. hero illustrations, full-page graphics). Scales with user zoom. Examples: `"16rem"` (≈256px), `"11rem"` (≈176px).

3. **Percentages / `vw` / `vh`** — for responsive layouts that should track the viewport or parent container.

4. **Raw pixel strings** (`"258px"`) — only as a last resort with justification.

**MUI gotcha:** in `sx`, numeric `width`/`height` values are treated as **raw pixels**, not `theme.spacing(n)`. The spacing shortcut only applies to `padding`/`margin`/`gap`. To get theme spacing on a dimension, call `theme.spacing()` explicitly via the `sx` callback.

```typescript
// ✅ Correct — within the spacing scale, via callback
<Box sx={(theme) => ({ width: theme.spacing(8), height: theme.spacing(8) })} />

// ✅ Correct — larger than the spacing scale, use rem
<Box sx={{ width: "16rem", height: "11rem" }} />

// ❌ Wrong — out of range (max index is 12). theme.spacing(32) returns undefined → renders as 0
<Box sx={(theme) => ({ width: theme.spacing(32), height: theme.spacing(22) })} />

// ❌ Wrong — renders as 8×8 px (raw pixels), not theme.spacing(8) = 32px
<Box sx={{ width: 8, height: 8 }} />

// ❌ Wrong — raw pixel string without justification
<Box sx={{ width: "258px", height: "176px" }} />
```

For `padding`/`margin`/`gap`, numeric values pass through the spacing scale automatically — `padding: 4` is `12px`. That auto-resolution does **not** happen for `width`/`height`. The asymmetry is a MUI quirk, not a CBH choice.

## Images

Images (`<img>`, `<Box component="img">`, `<Image>`, MUI `<Avatar>` with an image `src`, SVG components rendered from asset files) **must specify both an explicit `width` and `height`** per the Dimensions rule above. Pair with `objectFit: "contain"` (or `"cover"`) so a swapped asset stays inside the fixed box.

**Why:** without explicit dimensions, the rendered box collapses to the source asset's intrinsic aspect ratio. Swapping the asset (e.g. a redesigned PNG/SVG with different dimensions) then shifts surrounding layout — in the worst case, pushing content off the viewport.

```typescript
// ✅ Correct — small icon, theme spacing fits
<Image
  src="/assets/icons/check.svg"
  alt="Verified"
  sx={(theme) => ({
    width: theme.spacing(6),
    height: theme.spacing(6),
    objectFit: "contain",
  })}
/>

// ✅ Correct — hero illustration, larger than spacing scale, use rem
<Image
  src="/assets/images/work-badge.svg"
  alt="Create Work Badge"
  width="16rem"
  height="11rem"
  sx={{ objectFit: "contain" }}
/>

// ❌ Wrong — width/height props on Image flow into sx as raw pixels (8×8, not theme.spacing(8))
<Image src="..." alt="..." width={8} height={8} />

// ❌ Wrong — theme.spacing(32) out of range, renders as 0
<Image src="..." alt="..." sx={(theme) => ({ width: theme.spacing(32) })} />

// ❌ Wrong — height tracks the source asset's aspect ratio
<Image src="..." alt="..." width="258px" height="auto" />

// ❌ Wrong — no dimensions; layout depends entirely on the asset's intrinsic size
<Image src="/assets/images/work-badge.png" alt="Work Badge" />
```
