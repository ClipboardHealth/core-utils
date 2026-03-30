# Bottom Sheets

## Closing

Every bottom sheet must include a close button in the top-right corner via `BottomSheetHeader`:

```typescript
<BottomSheet
  modalState={modalState}
  header={<BottomSheetHeader onClose={onClose} />}
>
```

## Component Structure

Split each bottom sheet into two components for Storybook testability:

- **`SomethingBottomSheet`** — connected component that owns data fetching, analytics, and state; renders `<BottomSheet>` and delegates content to the presentational component.
- **`SomethingBottomSheetContent`** — pure presentational component that accepts only primitive/callback props; has a `.stories.tsx` file. The stories file should render a button that opens the content in a `<BottomSheet>`.

An exception to this rule is if the bottom sheet itself is just presentational with no data fetching/mutations. Then it can just be one .tsx file.

## Button Layout

Buttons inside a bottom sheet must always stack vertically (never side by side). Use `<DialogFooter orientation="vertical">` or a vertical `<Stack>`.
