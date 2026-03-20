---
name: figma-to-code
description: "Implement UI from a Figma design in the CBH Admin Frontend. Use when the user shares a Figma URL, asks to implement a design, or says things like 'build this from Figma', 'match this design', 'implement this Figma', or 'figma to code'."
argument-hint: "<figma-url>"
---

# Figma to Code: CBH Admin Frontend

You are implementing a UI from a Figma design in the CBH Admin Frontend codebase. The user will provide a Figma URL (and optionally a screenshot). Your job is to fetch the design, map it to existing components and theme tokens, and produce production-ready code.

## Step 1: Fetch the Design

Extract `fileKey` and `nodeId` from the Figma URL and call `mcp__claude_ai_Figma__get_design_context`.

URL patterns:
- `figma.com/design/:fileKey/:fileName?node-id=:nodeId` → convert `-` to `:` in nodeId
- `figma.com/design/:fileKey/branch/:branchKey/:fileName` → use branchKey as fileKey

Always include `clientFrameworks: "react"` and `clientLanguages: "typescript"`.

## Step 2: Interpret the Design (DO NOT generate code yet)

The Figma MCP returns React+Tailwind reference code. **NEVER use Tailwind.** This output is a reference only.

Before writing any code:
1. Read the screenshot returned by the MCP carefully
2. **Ignore hidden elements** — Figma nodes with `visible: false` or `opacity: 0` are design-time helpers (e.g., bounding boxes, redline guides, hidden variants). Do NOT implement them.
3. Read any `data-annotations` attributes — they contain implementation hints (e.g., menu items, behaviors)
4. Identify which existing redesign components match each Figma element
5. Map all Figma design tokens (`--berlin/*`) to MUI theme tokens
6. If the user provided a screenshot, compare it with the Figma screenshot — only implement what's visually present

## Step 3: Map to Existing Components

**ALWAYS search the codebase first** for existing components before creating new ones. The redesign component library is in `src/appV2/redesign/components/`.

### Component Mapping

| Figma Element | Codebase Component | Import Path |
|---|---|---|
| Button (any variant) | `<Button>` | `redesign/components/Button` |
| Icon-only button | `<IconButton>` | `redesign/components/IconButton` |
| Icon | `<Icon>` | `redesign/components/Icon` |
| Avatar / profile image | `<Avatar>` | `redesign/components/Avatar` |
| Text / label | `<Text>` | `redesign/components/Text` |
| Heading | `<Title>` | `redesign/components/Title` |
| Chip / filter pill | `<Chip>` | `redesign/components/Chip` |
| Tag / status badge | `<Tag>` | `redesign/components/Tag` |
| Pill | `<Pill>` | `redesign/components/Pill` |
| Input field | `<TextInput>` | `redesign/components/TextInput` |
| Checkbox | `<Checkbox>` | `redesign/components/Checkbox` |
| Tabs | `<Tabs>` + `<Tab>` | `redesign/components/Tabs` |
| Modal/dialog (desktop) | `<Dialog>` | `redesign/components/Dialog` |
| Modal/dialog (responsive) | `<ResponsiveDialog>` | `redesign/components/ResponsiveDialog` |
| Bottom sheet (mobile) | `<BottomSheet>` | `redesign/components/BottomSheet` |
| Side panel | `<SidePanel>` | `redesign/components/SidePanel` |
| Drawer (full-height) | `<Drawer>` | `redesign/components/Drawer` |
| Divider line | `<Divider>` | `redesign/components/Divider` |
| Loading spinner | `<Loader>` | `redesign/components/Loader` |
| Notification dot | `<Badge>` | `redesign/components/Badge` |
| Data table | `<DataGrid>` | `redesign/components/DataGrid` |

### Button Variants
- Figma solid blue button → `variant="primary"`
- Figma dark/black button → `variant="secondary"`
- Figma outlined button → `variant="outlined"`
- Figma text button → `variant="link"`
- Figma red button → `variant="danger"`
- Figma orange button → `variant="warning"`
- Figma ghost/no-border button → `variant="muted"`

### Button Sizes
- Figma small (24px height) → `size="small"`
- Figma medium (38px height) → `size="medium"`
- Figma large (54px height) → `size="large"`

### Button with icon
Use `startIconType` or `endIconType` prop with the icon name from the Icon type registry.

### Icon Names
Before using an icon, verify it exists in `src/appV2/redesign/components/Icon.types.tsx`. Search for the closest match. Common mappings:
- Chain link / hyperlink icon → `"hyperlink"`
- Key / credential icon → `"key-outline"`
- Three dots horizontal → `"ellipsis"`
- Three dots vertical → `"ellipsis-vertical"`
- Chat bubble → `"message"`
- File/document icon → `"documents"`
- X / close → `"close"`
- Star → `"star-five-sides"`
- Block / stop → `"general-stop"`
- Search → `"magnifying-glass"`
- Plus → `"plus"`
- Pencil / edit → `"pencil"`
- Trash / delete → `"trash"`
- Download → `"download"`
- Arrow left → `"arrow-left"`
- Arrow right → `"arrow-right"`
- Chevron down → `"chevron-down"`
- Chevron right → `"chevron-right"`
- Calendar → `"calendar"`
- Clock → `"clock"`
- Filter → `"filter"`
- Person → `"person-male"`
- Building → `"building"`
- Dollar → `"dollar"`
- Information → `"information"`
- Warning → `"warning"`
- Bookmark → `"bookmark"`
- Briefcase → `"briefcase"`
- Cogwheel / settings → `"cogwheel"`

### Text Variants
- Figma 24px → `variant="h5"` (x-large)
- Figma 18px → `variant="h6"` (large)
- Figma 16px → `variant="body1"` (normal, default)
- Figma 14px → `variant="body2"` (small)
- Figma 12px → `variant="caption"` (x-small)
- Figma 11px → `variant="overline"` (2x-small)
- Figma Medium weight (500) → `semibold` prop
- Figma Bold weight (700) → `bold` prop
- Figma Light weight (300) → `light` prop
- Figma inline text (span) → `inline` prop

## Step 4: Map Design Tokens to Theme

### Berlin Token → MUI Theme Mapping

**Spacing** (custom scale, NOT default MUI 8px base):
| Berlin Token | `theme.spacing()` | Pixels |
|---|---|---|
| `--berlin/padding/2x-small` | `spacing(0.5)` | 1px |
| `--berlin/padding/x-small` | `spacing(1)` | 2px |
| `--berlin/padding/small` | `spacing(2)` | 5px |
| `--berlin/padding/normal` | `spacing(3)` | 10px |
| `--berlin/padding/large` | `spacing(4)` | 15px |
| `--berlin/padding/x-large` | `spacing(5)` | 20px |
| `--berlin/padding/2x-large` | `spacing(6)` | 30px |
| `--berlin/padding/3x-large` | `spacing(7)` | 40px |
| `--berlin/padding/4x-large` | `spacing(8)` | 80px |

**Border Radius:**
| Berlin Token | Theme Token | Pixels |
|---|---|---|
| `--berlin/border-radius/x-small` | `theme.borderRadius?.xSmall` | 3px |
| `--berlin/border-radius/small` | `theme.borderRadius?.small` | 6px |
| `--berlin/border-radius/medium` | `theme.borderRadius?.medium` | 8px |
| `--berlin/border-radius/large` | `theme.borderRadius?.large` | 12px |
| `--berlin/border-radius/x-large` | `theme.borderRadius?.xLarge` | 16px |
| `--berlin/border-radius/2x-large` | `theme.borderRadius?.xxLarge` | 30px |
| `--berlin/border-radius/3x-large` | `theme.borderRadius?.xxxLarge` | 40px |

**Colors:**
| Berlin Token | Theme Token |
|---|---|
| `--berlin/color/base` | `theme.palette.text.primary` or `theme.palette.base?.base` |
| `--berlin/color/strong` | `theme.palette.base?.strong` |
| `--berlin/color/muted` | `theme.palette.text.secondary` or `theme.palette.base?.muted` |
| `--berlin/color/inactive` | `theme.palette.base?.inactive` |
| `--berlin/color/primary` | `theme.palette.primary.main` or `theme.palette.base?.primary` |
| `--berlin/color/danger` | `theme.palette.base?.danger` |
| `--berlin/color/warning` | `theme.palette.statusChip?.warning.text` |
| `--berlin/background-color/standout` | `theme.palette.background.standout` (white) |
| `--berlin/background-color/base` | `theme.palette.background.base` |
| `--berlin/background-color/medium` | `theme.palette.background.medium` |
| `--berlin/background-color/muted` | `theme.palette.background.muted` |
| `--berlin/background-color/primary` | `theme.palette.background.primary` |
| `--berlin/background-color/warning` | `theme.palette.background.warning` |
| `--berlin/background-color/error` | `theme.palette.background.error` |
| `--berlin/border-color/base` | `theme.palette.border?.base` |
| `--berlin/border-color/muted` | `theme.palette.border?.muted` |
| `--berlin/border-color/strong` | `theme.palette.border?.strong` |
| `--berlin/border-color/primary` | `theme.palette.border?.primary` |
| `--berlin/buttons/styles/primary/*` | Use `variant="primary"` on Button |
| `--berlin/buttons/styles/outline/*` | Use `variant="outlined"` on Button |

**Shadows:**
| Purpose | Theme Token |
|---|---|
| Cards | `theme.shadow?.card` |
| Modals | `theme.shadow?.modal` |
| Drawers | `theme.shadow?.drawer` |
| Bottom sheets | `theme.shadow?.bottomSheet` |
| Floating nav | `theme.shadow?.floatingNavigation` |

**Border Width:**
| Berlin Token | Theme Token | Pixels |
|---|---|---|
| `--berlin/border-width/regular` | `theme.borderWidth?.regular` | 1px |
| `--berlin/border-width/thick` | `theme.borderWidth?.thick` | 2px |

**Font Sizes (Berlin → Typography variant):**
| Berlin Token | MUI Variant | Pixels |
|---|---|---|
| `--berlin/font-size/2x-small` | `overline` | 11px |
| `--berlin/font-size/x-small` | `caption` | 12px |
| `--berlin/font-size/small` | `body2` | 14px |
| `--berlin/font-size/normal` | `body1` | 16px |
| `--berlin/font-size/large` | `h6` | 18px |
| `--berlin/font-size/x-large` | `h5` | 24px |

## Step 5: Styling Rules (MANDATORY)

1. **ALWAYS use MUI `sx` prop** — never CSS/SCSS/styled()/makeStyles()/Tailwind
2. **NEVER hardcode colors** — always use `theme.palette.*`
3. **NEVER hardcode border radius** — use `theme.borderRadius?.{size}` or the component's built-in border radius
4. **Use theme spacing** — `theme.spacing(n)` or shorthand numeric values in sx (`padding: 5` = `theme.spacing(5)` = 20px)
5. **Use `(theme) =>` callback** for type-safe theme access:
   ```typescript
   sx={(theme) => ({
     borderBottom: `1px solid ${theme.palette.border?.base}`,
     padding: theme.spacing(5),
   })}
   ```
6. **Borders**: Always use `theme.palette.border?.base` for color, `theme.borderWidth?.regular` (1px) or `thick` (2px) for width
7. **Never extract JSX into local variables** — inline or extract to a separate component

## Step 6: Architecture Rules

1. **New features go in `src/appV2/redesign/`**
2. **Container/View pattern**: Container fetches data, View is pure presentation
3. **Feature folder structure**:
   ```
   FeatureName/
   ├── api/           # API hooks
   ├── components/    # Presentational components
   ├── hooks/         # Custom hooks
   ├── utils/         # Pure functions
   ├── Container.tsx  # Data fetching
   ├── View.tsx       # Presentation
   ├── types.ts       # Domain types
   └── constants.ts   # Constants
   ```
4. **Responsive**: Use `useIsMobile()` from `redesign/AppLayout/useResponsive` (breakpoint: 640px)
5. **Modal state**: Use `useModalState()` from `@clipboard-health/ui-react`
6. **Null checks**: Use `isDefined()` from `@clipboard-health/util-ts`, never truthy checks for null/undefined

## Step 7: Breakpoints

| Name | Width | Hook |
|---|---|---|
| Mobile | < 640px (md) | `useIsMobile()` |
| Tablet | < 1024px (lg) | `useIsTablet()` |
| Desktop | >= 1024px (lg) | `useIsDesktop()` |

Mobile renders BottomSheet for overlays. Desktop renders SidePanel/Dialog.

## Step 8: Implementation Checklist

Before writing code, confirm:
- [ ] Fetched Figma design context with screenshot
- [ ] Identified ALL existing components to reuse
- [ ] Mapped ALL Figma tokens to theme tokens
- [ ] Checked data-annotations for behavioral hints
- [ ] Verified icon names exist in Icon.types.tsx
- [ ] Identified responsive differences (mobile vs desktop)

After writing code, verify:
- [ ] No hardcoded colors (grep for `#`, `rgb`, `rgba` in new code)
- [ ] No JSX local variables — only inline JSX or extracted components
- [ ] No Tailwind classes
- [ ] All `isDefined()` for null checks, not truthy
- [ ] sx prop uses `(theme) =>` callback where theme tokens are needed
- [ ] Tests pass (`npm run test:v2` and `npm run typecheck:v2`)

## Common Pitfalls from Past Sessions

1. **Theme spacing is NOT 8px base** — this project uses a custom scale (spacing(1)=2px, spacing(2)=5px, etc.). Never convert px to spacing by dividing by 8.
2. **Figma returns Tailwind classes** — NEVER use them. Convert every class to MUI sx prop equivalent.
3. **Figma returns `<img>` tags for icons** — Replace with `<Icon type="..." />` component.
4. **Figma asset URLs expire in 7 days** — Never use them in production code. Download SVGs and register as icons if new.
5. **The `hyperlink` icon** exists but is being replaced by `key-outline` for credential actions.
6. **Desktop rows** use a single rounded container with internal dividers, NOT individual bordered cards. Mobile cards DO use individual bordered cards.
7. **Status badges** have different rendering per viewport: plain colored text on desktop, Tags on mobile for "In progress"/"Starts in X hrs".
8. **Figma hidden properties** — nodes with `visible: false` or `opacity: 0` are design helpers. Do not implement them.
9. **CircularXX font in Figma** — maps to the "Circular" font family in the codebase theme. Do not add font-family overrides.
10. **Figma `flex-[1_0_0]`** — means `flex: 1` in sx prop. Figma uses Tailwind shorthand for flex properties.
