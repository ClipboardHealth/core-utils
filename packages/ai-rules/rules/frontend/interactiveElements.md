# Interactive Elements

Never add `onClick` to `div` or `span`. Use:

- `<button>` for actions
- `<a>` (Link) for navigation
- MUI interactive components (`Button`, `IconButton`, `ListItemButton`)

This ensures proper accessibility: focus states, keyboard navigation, ARIA roles.

## Keyboard Accessibility

Every interactive element must be:

- Tab focusable (proper tab order)
- Visually indicated when focused (visible focus indicator)
- Assigned appropriate ARIA roles
- Equipped with keyboard event handling (Enter/Space for buttons, Enter for links)
- Styled with pointer cursor
