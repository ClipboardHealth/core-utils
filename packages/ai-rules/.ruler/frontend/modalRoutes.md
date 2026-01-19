# Modal Routes

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
