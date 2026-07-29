---
description: "Creating React custom hooks: naming, shared state with constate"
---

# Custom Hooks

## Naming

- Boolean: `useIs*`, `useHas*`, `useCan*`
- Data: `useGet*`, `use*Data`
- Actions: `useSubmit*`, `useCreate*`

## Shared State with Constate

Wrap a hook with `constate` to get a provider/hook pair, named `<Feature>Provider` and `use<Feature>Context`. Use it for sharing state between siblings and for feature-level state; not for server state (use React Query) or simple parent-child passing (use props).
