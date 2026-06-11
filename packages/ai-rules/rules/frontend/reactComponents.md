---
description: "Building UI components: structure, composition, modals, bottom sheets, interactive elements, a11y, Storybook"
---

# React Components

## Naming Conventions

- Event handlers: `handle*` (e.g., `handleClick`)
- Props interface: `Props` (co-located) or `ComponentNameProps` (exported)

## Component Guidelines

- **One file per component**—never extract JSX into local variables
- **Composition over configuration**—prefer `children` over many props
- **Presentational components**: stateless, UI-focused, no API calls
- **Container components**: feature logic, data fetching, state management
- Pass primitives as props, not entire API response objects

```typescript
// ❌ Bad—coupled to API shape
interface Props {
  shift: ShiftApiResponse;
}

// ✅ Good—only required fields
interface Props {
  shiftId: string;
  shiftPay: number;
  workplaceId: string;
}
```

## Inline JSX and Handlers

```typescript
// ❌ Don't extract JSX to variables
const content = <p>Content</p>;
return <>{content}</>;

// ✅ Keep inline or extract to new component file
return <p>Content</p>;

// ✅ Simple handlers: keep inline
return <Input onChange={(e) => setValue(e.target.value)} />;

// ✅ Complex handlers with deps or passed to memoized children: extract with useCallback
const handleSave = useCallback(async () => { ... }, [deps]);
return <MemoizedChild onSave={handleSave} />;
```

## Interactive Elements

Never add `onClick` to `div` or `span` — it breaks focus states, keyboard navigation, and ARIA roles. Use:

- `<button>` for actions
- `<a>` (Link) for navigation
- MUI interactive components (`Button`, `IconButton`, `ListItemButton`)

Every interactive element must be tab focusable with a visible focus indicator and keyboard event handling.

## Navigation & Layout

- Show bottom navigation on all top-level tabs/pages; hide it on nested or drilled-in views
- Use `Title` with correct heading levels (`h1`-`h6`) and maintain a structured `h1`→`h2`→`h3` hierarchy per page

## Modal Routes

Modal visibility is driven by URL, not local state:

```typescript
<ModalRoute
  path={`${basePath}/confirm`}
  closeModalPath={basePath}
  render={({ modalState }) => (
    <ConfirmDialog modalState={modalState} />
  )}
/>
```

Use `history.replace` (not `push`) when navigating between modals to avoid awkward back-button behavior.

## Bottom Sheets

- Every bottom sheet must include a close button in the top-right corner via `BottomSheetHeader`: `<BottomSheet modalState={modalState} header={<BottomSheetHeader onClose={onClose} />}>`
- Buttons inside a bottom sheet must always stack vertically (never side by side). Use `<DialogFooter orientation="vertical">` or a vertical `<Stack>`.
- Split each bottom sheet into two components for Storybook testability:
  - **`SomethingBottomSheet`** — connected component that owns data fetching, analytics, and state; renders `<BottomSheet>` and delegates content to the presentational component.
  - **`SomethingBottomSheetContent`** — pure presentational component that accepts only primitive/callback props; has a `.stories.tsx` file. The stories file should render a button that opens the content in a `<BottomSheet>`.
  - Exception: a bottom sheet that is purely presentational with no data fetching/mutations can be one `.tsx` file.

## Storybook

Register every new or updated shared UI component in Storybook before merging; include a `Default` story first with all relevant props exposed via controls.

## Component Reuse

Before creating a new component, search for existing ones in this order:

1. **MUI**: Search MUI's component library for existing components before building custom ones
2. **App-level shared directories**: e.g., `src/appV2/lib/`, `src/lib/components/`, `src/shared/`
3. **Sibling features**: search for `*Card`, `*Modal`, `*Form`, `*EmptyState`, `*Page` patterns in other features

If an existing component covers >70% of the need, extend it (prefer composition over boolean flags). Only create a new component when behavior is fundamentally different — document why in the PR.
