# React

- Destructure props in function body rather than in function signature
- Prefer inline JSX rather than extracting variables and functions as variables outside of JSX
- Use useModalState for any showing/hiding functionality like dialogs
- Utilize custom hooks to encapsulate and reuse stateful logic
- When performing data-fetching in a custom hook, always use Zod to define any request and response schemas
- Use react-hook-form for all form UIs and use zod resolver for form schema validation
- Use date-fns for any Date based operations like formatting
