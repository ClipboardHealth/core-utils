# Interactive Elements

Never add `onClick` to `div` or `span`. Use:

- `<button>` for actions
- `<a>` (Link) for navigation
- MUI interactive components (`Button`, `IconButton`, `ListItemButton`)

This ensures proper accessibility: focus states, keyboard navigation, ARIA roles.
